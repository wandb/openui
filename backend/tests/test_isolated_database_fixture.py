"""Focused tests for the ``isolated_database`` fixture's own teardown.

These drive the fixture's underlying generator function directly (bypassing
pytest's fixture injection) so we can assert on the process-global
``database`` object's state *before*, *during*, and *after* the fixture
runs -- including after a simulated failure inside the test body -- to
prove it always restores the original database target and connection
state, not just during the happy path.
"""

import pytest

from openui.db.models import database
from tests.conftest import isolated_database as isolated_database_fixture


class _SimulatedTestFailure(Exception):
    """Stand-in for an assertion failure raised inside a test body."""


def test_isolated_database_fixture_restores_target_after_normal_teardown(tmp_path):
    original_target = database.database
    was_connected = not database.is_closed()

    generator = isolated_database_fixture.__wrapped__(tmp_path)
    next(generator)  # run fixture setup

    # Setup really did repoint the global database at the temp file.
    assert database.database != original_target

    # Drive teardown to completion (the normal, no-error path).
    with pytest.raises(StopIteration):
        next(generator)

    assert database.database == original_target
    assert database.is_closed() == (not was_connected)


def test_isolated_database_fixture_restores_target_after_failed_test(tmp_path):
    original_target = database.database
    was_connected = not database.is_closed()

    generator = isolated_database_fixture.__wrapped__(tmp_path)
    next(generator)  # run fixture setup

    assert database.database != original_target

    # Simulate the test body raising (e.g. a failed assertion) at the
    # point where the fixture is suspended on `yield`.
    with pytest.raises(_SimulatedTestFailure):
        generator.throw(_SimulatedTestFailure("simulated test failure"))

    assert database.database == original_target
    assert database.is_closed() == (not was_connected)
