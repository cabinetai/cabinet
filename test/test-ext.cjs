const { app, session } = require("electron");
app.whenReady().then(async () => {
  const browserSession = session.fromPartition("persist:cabinet-browser");
  try {
    const ext = await browserSession.loadExtension(
      "/Users/odebroqueville/Library/Application Support/cabinet/extensions/ngeokhpbgoadbpdpnplcminbjhdecjeb"
    );
    console.log("Loaded ID:", ext.id);
  } catch(e) {
    console.error(e);
  }
  app.quit();
});
