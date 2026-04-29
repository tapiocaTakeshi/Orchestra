<<<SEARCH
  const win = new BrowserWindow({
    width: 800,
    height: 600,
===
  const win = new BrowserWindow({
    width: 960,
    height: 640,
    minWidth: 480,
    minHeight: 360,
    backgroundColor: '#ffffff',
    frame: false,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 12, y: 12 },
    show: false,
>>>REPLACE
