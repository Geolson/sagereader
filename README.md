# 📖 SageReader - Setup & GitHub Pages Hosting Guide

SageReader is a modern, client-side document reader app featuring Text-To-Speech (TTS) narration with word-highlight tracking and local library persistence. Because it is written in pure vanilla HTML, CSS, and JS, it can be hosted on GitHub Pages for free with **zero configuration or build steps**.

---

## 🚀 Step-by-Step GitHub Hosting

Follow these steps to upload SageReader to your GitHub profile and set up hosting:

### Step 1: Initialize Git and Commit Locally
Open your terminal (PowerShell, Git Bash, or CMD) in the project directory (`pdf_reader`) and run:
```bash
# 1. Initialize a new local Git repository
git init

# 2. Add all project files
git add index.html styles.css app.js sample.txt

# 3. Commit the files locally
git commit -m "Initial commit of SageReader Book App"
```

### Step 2: Create a New GitHub Repository
1. Log in to your account at [github.com](https://github.com).
2. Click the **New** button (or go to `https://github.com/new`).
3. Set the Repository Name to **`sagereader`** (or any name you prefer).
4. Choose **Public** (so GitHub Pages hosting is free).
5. Do **NOT** initialize the repository with a README, `.gitignore`, or License (since we are uploading existing code).
6. Click **Create repository**.

### Step 3: Link Local Folder & Push to GitHub
Copy the commands shown on your GitHub repository page under "or push an existing repository from the command line", which will look like this:
```bash
# 1. Rename your default branch to main
git branch -M main

# 2. Link your local repository to the remote GitHub repository
git remote add origin https://github.com/YOUR_USERNAME/sagereader.git

# 3. Push your files to GitHub
git push -u origin main
```
*(Make sure to replace `YOUR_USERNAME` with your actual GitHub username!)*

### Step 4: Turn On GitHub Pages
1. Go to your repository on the GitHub website.
2. Click on the **Settings** tab (the gear icon on the top tab bar).
3. In the left-hand sidebar menu, click on **Pages** (under the "Code and automation" section).
4. Under **Build and deployment**:
   *   **Source**: Select `Deploy from a branch` (default).
   *   **Branch**: Select **`main`** from the dropdown, and leave the folder set to **`/ (root)`**.
5. Click **Save**.

---

## ⚡ Important Notes & FAQ

### Do I need any special repository files?
**No.** Some frameworks require a `gh-pages` branch, custom GitHub Actions, or configurations. SageReader requires **none** of these because it does not need a build process. GitHub Pages hosts it directly as-is.

### Will files load correctly in a subfolder?
**Yes.** Standard hosting directories use path links like `/styles.css` which break in GitHub Pages subfolders (e.g. `yourname.github.io/sagereader/styles.css` is searched at `yourname.github.io/styles.css`). 
We have pre-configured SageReader using **relative paths** (`./styles.css` and `./app.js`) so it will resolve and load perfectly in any GitHub Pages subfolder.

### How does database storage persist on GitHub?
SageReader uses **IndexedDB** which runs inside the user's web browser. It binds itself automatically to your GitHub Pages URL (domain-specific sandboxing). This ensures your visitors' files are stored privately on their local hard drives with zero host fees.
