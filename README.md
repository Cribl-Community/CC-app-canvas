# App Canvas

App Canvas is an AI-powered builder for [apps] (https://docs.cribl.io/apps/) built on Cribl's platform. Describe what you want in plain English, and App Canvas generates a working React app — live in the preview — that you can download and install directly into Cribl.

## Installation

1. Go to the latest [release] (https://github.com/Cribl-Community/CC-app-canvas/releases/latest).
2. Under Assets, right click on the app .tgz file (the first entry) and copy the url.
3. Log in to Cribl and then click on **Apps->View All**
4. Click **Add App->Import from Url**.
5. Paste the app url you copied to the clipboard.
6. Click **Import**.

---

## Getting started

Open App Canvas from within Cribl. No account or login is required beyond your existing Cribl session.

Before you can generate apps, you need to configure an AI provider in **Settings** (the ⚙ button in the top-right corner). Choose one:

- **Anthropic** — enter your API key from [console.anthropic.com](https://console.anthropic.com). The key is sent through the Cribl proxy and is never stored on an external server.
- **AWS Bedrock** — enter your AWS region, Access Key ID, and Secret Access Key. Your IAM user needs the `bedrock:InvokeModelWithResponseStream` permission.

Once a provider is configured, you're ready to build.

---

## Building an app

1. Click **+ New** (or just start typing — a project is created automatically on your first message).
2. Describe the app you want. Be as specific or as vague as you like. Some examples to get started:
   - *"Build a pipeline monitor dashboard that shows active Cribl pipelines and their throughput"*
   - *"Create a log search app that queries Cribl search and displays results in a table"*
   - *"Make a KV store browser to view and edit key-value pairs"*
   - *"Build a system health dashboard with CPU, memory, and event rate metrics"*
3. The AI streams a response and writes the app files in real time. The **preview panel** on the right automatically rebuilds and displays the running app.
4. Keep chatting to iterate — ask for new features, style changes, bug fixes, or anything else.

### Tips for good prompts

- Name the specific Cribl APIs you want to use (e.g. "use the `/search/jobs` endpoint" or "read from the KV store").
- Describe the layout you want ("two-column", "sidebar with a table on the right", etc.).
- If a generated app is close but not quite right, just describe what needs to change — you don't need to start over.
- To try a complete example without prompting, click **⚗ Sample** in the toolbar.

---

## The interface

| Area | What it does |
|---|---|
| **Left sidebar** | Lists all your projects. Click to switch between them. Hover to rename or delete. |
| **Chat panel** | Your conversation with the AI. All history is saved per-project. |
| **Preview panel** | A live running instance of the generated app, rebuilt automatically after each AI response. |
| **File editor** | Click **</> Files** in the toolbar to open a split code editor. You can manually edit any file and click **Build** to rebuild the preview. |

The divider between the chat panel and the preview is draggable — slide it left or right to give more space to whichever side you need.

---

## Editing files manually

Click **</> Files** in the toolbar to reveal the code editor alongside the preview. From there you can:

- Browse all generated files in the tree on the left.
- Edit any file directly.
- Click **Build** to rebuild and refresh the preview with your changes.

Manual edits are automatically saved and will be included as context the next time you send a message to the AI.

---

## Downloading your app

Once you're happy with an app, you can download it in two formats from the toolbar:

| Button | What you get |
|---|---|
| **↓ .tgz** | A deployable Cribl app package. Install it through the Cribl App Manager. |
| **↓ Source** | The raw source files as a `.tgz`. Run `npm install && npm run dev` to develop locally, or `npm run package` to build your own installable package. |

---

## Managing projects

All projects are stored in the Cribl KV store scoped to your App Canvas installation — they persist across sessions and are private to your Cribl instance.

- **Rename** a project by hovering over it in the sidebar and clicking the edit icon, or by double-clicking the name.
- **Delete** a project from the sidebar hover menu. Deletion is permanent.
- Projects are named automatically from your first message. You can rename them at any time.

---

## AI provider settings

Settings are saved in the KV store and persist across sessions. To change your provider or credentials at any time, click **⚙ Settings**.

### Anthropic

Calls are made to `api.anthropic.com` through the Cribl proxy. Your API key is stored in the KV store and injected at request time — it is never visible in the app or transmitted to any other destination.

### AWS Bedrock

Calls are made to the Bedrock streaming inference endpoint in your chosen region. Credentials are stored in the KV store. Required IAM permission: `bedrock:InvokeModelWithResponseStream`.
