const { app, session, BrowserWindow, WebContentsView } = require("electron");
app.whenReady().then(async () => {
  const win = new BrowserWindow({width: 800, height: 600});
  const view = new WebContentsView({
    webPreferences: {
      enablePreferredSizeMode: true
    }
  });
  win.contentView.addChildView(view);
  view.setBounds({x:0, y:0, width: 800, height: 600});
  view.webContents.on('preferred-size-changed', (e, size) => {
    console.log("Size changed:", size);
  });
  view.webContents.loadURL("data:text/html,<body style='width: 400px; height: 500px; background: red;'>Hello</body>");
  setTimeout(() => app.quit(), 2000);
});
