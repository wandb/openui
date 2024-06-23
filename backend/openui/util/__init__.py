try:
    from .screenshots import gen_screenshots
    from .email import get_git_user_email
except ImportError:
    # TODO: WTF
    def get_git_user_email():
        return None

    def gen_screenshots(*args, **kwargs):
        pass


__all__ = ["gen_screenshots", "get_git_user_email"]
