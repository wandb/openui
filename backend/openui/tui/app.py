from pathlib import Path
from textual.app import App, ComposeResult
from textual.widgets import (
    Footer,
    Header,
    TextArea,
    TabbedContent,
    TabPane,
    RichLog,
)
from rich.highlighter import ISO8601Highlighter
from ..logs import logger
import pyperclip

md = """
# OpenUI

Visit http://localhost:7878 to get started
"""


class OpenUIApp(App):
    """Terminal application for OpenUI"""

    DEFAULT_CSS = """
    """

    BINDINGS = [
        ("l", "show_tab('logs')", "Logs"),
        ("e", "show_tab('openui')", "OpenUI"),
        ("c", "copy", "Copy"),
        ("q", "quit", "Quit"),
    ]
    offset = 0

    @property
    def queue(self):
        return self._message_queue

    def on_mount(self):
        self.title = "OpenUI http://127.0.0.1:7878"

    def on_session_update(self, message):
        if message.session_data.markdown is not None:
            logger.debug("Updating Open UI %s", message.session_data.name)
            foo = self.query_one(TextArea)
            foo.text = message.session_data.html
            self.sub_title = message.session_data.name
        else:
            logger.debug("No markdown to update")

    def compose(self) -> ComposeResult:
        """Compose app with tabbed content."""
        yield Footer()
        yield Header()

        with TabbedContent(initial="openui"):
            with TabPane("OpenUI", id="openui"):
                yield TextArea.code_editor(md, language="html")
            with TabPane("Logs", id="logs"):
                yield RichLog(auto_scroll=True, markup=True)

    def on_ready(self) -> None:
        self.set_interval(2, self.refresh_logs)

    def refresh_logs(self):
        highlight = ISO8601Highlighter()
        log = self.query_one(RichLog)
        logs = (Path("/tmp") / "openui.log").read_text()
        addition = logs[self.offset :]
        self.offset = len(logs)
        if len(addition) == 0:
            return
        log.write(highlight(addition))

    def action_copy(self) -> None:
        """Copy the markdown to the clipboard."""
        foo = self.query_one(TextArea)
        logger.debug("Copying %s", foo.text)
        pyperclip.copy(foo.text)

    def action_show_tab(self, tab: str) -> None:
        """Switch to a new tab."""
        self.get_child_by_type(TabbedContent).active = tab

    def action_quit(self) -> None:
        """Quit the app."""
        self.exit(message="Goodbye!")


if __name__ == "__main__":
    app = OpenUIApp()
    app.run()
