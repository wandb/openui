from pathlib import Path
from sys import argv

from textual.app import App, ComposeResult
from textual.reactive import var
from textual.widgets import Footer, MarkdownViewer

md = """
- name: Admin Dashboard
- emoji: 💻

---

# HTML
```html
<div class="flex flex-col md:flex-row h-screen">
  <div class="bg-gray-800 text-white p-6 md:w-1/4">
    <h2 class="text-xl font-bold mb-4">Navigation</h2>
    <ul>
      <li class="mb-2"><a href="#" class="hover:underline">Dashboard</a></li>
      <li class="mb-2"><a href="#" class="hover:underline">Users</a></li>
      <li class="mb-2"><a href="#" class="hover:underline">Products</a></li>
      <li class="mb-2"><a href="#" class="hover:underline">Orders</a></li>
    </ul>
  </div>
  <div class="flex-1 p-6 md:p-8">
    <h1 class="text-3xl font-bold mb-4">Dashboard</h1>
    <div class="flex flex-col lg:flex-row justify-between mb-4">
      <div class="bg-white p-4 rounded-lg shadow-md flex-1 mr-2 mb-2 lg:mb-0">
        <h2 class="text-xl font-bold mb-2">Total Users</h2>
        <p class="text-gray-700">1,568</p>
      </div>
      <div class="bg-white p-4 rounded-lg shadow-md flex-1 mr-2 mb-2 lg:mb-0">
        <h2 class="text-xl font-bold mb-2">Total Orders</h2>
        <p class="text-gray-700">3,568</p>
      </div>
      <div class="bg-white p-4 rounded-lg shadow-md flex-1 mr-2 mb-2 lg:mb-0">
        <h2 class="text-xl font-bold mb-2">Total Revenue</h2>
        <p class="text-gray-700">$56,890.34</p>
      </div>
    </div>
    <h2 class="text-xl font-bold mb-4">Recent Orders</h2>
    <table class="w-full table-auto border-collapse">
      <thead>
        <tr>
          <th class="border px-4 py-2 text-left">ID</th>
          <th class="border px-4 py-2 text-left">Customer Name</th>
          <th class="border px-4 py-2 text-left">Product</th>
          <th class="border px-4 py-2 text-right">Total</th>
          <th class="border px-4 py-2 text-center">Status</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td class="border px-4 py-2">#12345</td>
          <td class="border px-4 py-2">John Doe</td>
          <td class="border px-4 py-2">iPhone 12 Pro Max</td>
          <td class="border px-4 py-2 text-right">$1,599.00</td>
          <td class="border px-4 py-2 text-center"><span class="bg-green-500 text-white p-1 rounded-full">Delivered</span></td>
        </tr>
        <!-- Add more rows as needed -->
      </tbody>
    </table>
  </div>
</div>
```

# JavaScript
```jsx
<script>
  // Example interactivity: toggle dark mode
  const toggle = document.querySelector('.toggle');
  const body = document.body;

  toggle.addEventListener('click', () => {
    body.classList.toggle('dark');
    localStorage.setItem('dark-mode', body.classList.contains('dark'));
  });

  if (localStorage.getItem('dark-mode') === 'true') {
    body.classList.add('dark');
  }
</script>
```
"""


class MarkdownApp(App):
    BINDINGS = [
        ("t", "toggle_table_of_contents", "TOC"),
        ("b", "back", "Back"),
        ("f", "forward", "Forward"),
        ("q", "quit", "Quit"),
    ]

    path = var(None)

    @property
    def markdown_viewer(self) -> MarkdownViewer:
        """Get the Markdown widget."""
        return self.query_one(MarkdownViewer)

    def compose(self) -> ComposeResult:
        yield Footer()
        yield MarkdownViewer(markdown=md)

    async def on_mount(self) -> None:
        self.markdown_viewer.focus()
        if self.path is None:
            return
        try:
            await self.markdown_viewer.go(self.path)
        except FileNotFoundError:
            self.exit(message=f"Unable to load {self.path!r}")

    def action_toggle_table_of_contents(self) -> None:
        self.markdown_viewer.show_table_of_contents = (
            not self.markdown_viewer.show_table_of_contents
        )

    async def action_back(self) -> None:
        await self.markdown_viewer.back()

    async def action_forward(self) -> None:
        await self.markdown_viewer.forward()

    def action_quit(self) -> None:
        self.exit(message="Goodbye!")


if __name__ == "__main__":
    app = MarkdownApp()
    if len(argv) > 1 and Path(argv[1]).exists():
        app.path = Path(argv[1])
    app.run()
