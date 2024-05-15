try:
	from .screenshots import gen_screenshots
except ImportError:
	def gen_screenshots(*args, **kwargs):
		pass

__all__ = ["gen_screenshots"]

