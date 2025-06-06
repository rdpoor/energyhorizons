# Getting Started with Doh

Welcome to Doh! This guide will help you get your first Doh webserver up and running, explain what happens under the hood, and show you how to start customizing your project. Whether you're new to Doh or just want a quick refresher, you'll find everything you need to launch your first app.

---

## 1. Prerequisites

- **[Bun](https://bun.sh/)** installed (Doh uses Bun for speed and compatibility)
- Terminal or command prompt access
- (Optional) [Visual Studio Code](https://code.visualstudio.com/) for best editor integration

---

## 2. Install Doh

If you haven't already, install Doh globally:

**Windows:**
```powershell
powershell -c "irm deploydoh.com/install.ps1 | iex"
```

**Mac/Linux/Unix:**
```bash
curl -fsSL https://deploydoh.com/install | bash
```

---

## 3. Initialize a New Webserver Project

Navigate to the folder where you want your project, then run:

```bash
doh init webserver
```

This command scaffolds a complete Doh webserver project, including:
- `index.html` and `style.css` (editable homepage and styles)
- `pod.yaml` (instance configuration)
- `boot.pod.yaml` (project configuration)
- `.gitignore` (ignores build, config, and dependency files)
- `.vscode/` (VSCode launch configs and extension recommendations)
- All required dependencies (Express, Ajax, HMR, etc.)

> **Tip:** If `.gitignore` or `.vscode/` already exist, Doh will merge or update them with sensible defaults for Doh projects.

---

## 4. Run Your Webserver

Start your new app with:

```bash
doh run
```

Visit [http://localhost:3000](http://localhost:3000) in your browser. You should see a welcome page confirming your Doh webserver is running.

---

## 5. Make Your First Change (Hello World)

Open `index.html` in your editor. Change the main heading or any text, then save the file. Your browser will update instantly—no refresh needed—thanks to Doh's built-in Hot Module Replacement (HMR).

Example:
```html
<h1 class="gradient-text">
  <div>Hello, Doh!</div>
  <div>My First App</div>
</h1>
```

---

## 6. Explore the Project Structure

- **index.html**: Your app's homepage. Edit freely!
- **style.css**: Global styles for your app.
- **pod.yaml**: Project and server configuration (ports, HMR, etc.)
- **.gitignore**: Pre-configured to ignore build artifacts, dependencies, and local settings.
- **.vscode/**: Launch and debug settings for VSCode, plus recommended extensions (like `oven.bun-vscode`).

---

## 7. Next Steps & Use Cases

Doh is more than just a webserver. Here are some things you can try next:

- **Create a new module or component:**
  ```bash
  doh init wizard
  ```
  This launches an interactive wizard to help you build your first Doh module.

- **Add dynamic routes or APIs:**
  See the [Express Guide]({{DohballDocs:express}}) for unified HTTP and WebSocket routing.

- **Work with databases:**
  Explore [Dataforge]({{DohballDocs:dataforge}}) and [Database Integration]({{DohballDocs:db_dataforge}}).

- **Set up SSL and custom domains:**
  Check out [Greenlock SSL]({{DohballDocs:greenlockcli}}) for automatic HTTPS.

- **Deploy to production:**
  See [Quick Oracle VM Guide](/docs/guides/quick_oracle_vm) for a full cloud deployment walkthrough.

---

## 8. Troubleshooting & Tips

- **See instant changes?** If not, make sure HMR is enabled in `pod.yaml` (`browser_pod.hmr.enabled: true`).
- **Editor integration:** Open the folder in VSCode for best experience (debugging, launch configs, extension recommendations).
- **Need help?** Run `doh help` for CLI options, or visit the [Doh documentation](https://deploydoh.com/docs).

---

## 9. Learn More

- [Doh Documentation](https://deploydoh.com/docs)
- [API Reference](/docs/doh_ref)
- [Guides & Advanced Topics](/docs/guides/index)

---

Congratulations! You're ready to start building with Doh. 🚀 