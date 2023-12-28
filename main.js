const { ipcMain, dialog, app, BrowserWindow, Menu, shell } = require('electron')
const path = require('path')
const fs = require('fs/promises')
const windowStateKeeper = require('electron-window-state')
const Store = require('electron-store')
const hljs = require('highlight.js')
const {encode} = require('html-entities')


if (require('electron-squirrel-startup')) return app.quit()

const taskList = require('markdown-it-task-lists')

const markdownit = require('markdown-it')({
  highlight: (str, lang) => {
      if (lang && hljs.getLanguage(lang)) {
          try {
              return hljs.highlight(str, {language: lang}).value;
          } catch (__) {}
      }
    
      return '' // use external default
  }
})
.use(taskList)


markdownit.renderer.rules.table_open = ()=> {
  return '<table class="table is-striped">\n'
}



const render = (md, dt) => {
  const html = markdownit.render(md)
  return html + `<div class="content is-small">${dt}</div>`
}


// const g_ITEM_LIMIT = 5
const g_ITEM_LIMIT = 30

const store = new Store()

/**
 *   patに従うディレクトリ名（0パディングの数字）を数字的に新しい順にsortした配列として返す。
 * @param {string} dirPath 
 * @param {RegExp} pat 
 * @returns 
 */
const readDirs = async(dirPath, pat) => {
  const dirs = await fs.readdir(dirPath)

  return await Promise.all(
      dirs
      .filter(fname => fname.match(pat))
      .filter( async fname => {
          const full = path.join(dirPath, fname)
          return (await fs.stat(full)).isDirectory()
      } )
      .sort( (a, b) => a < b ? 1 : -1)
      )
}

/*
4桁の数字のdirを数字的にあたらしい順にsortした配列として返す。
*/
const readYears = async(dirPath) => {
  return await readDirs( dirPath, /^[0-9][0-9][0-9][0-9]$/)
}

/*
2桁の数字のdirを数字的に新しい順にsortした配列として返す
*/
const readMonths = async(dirPath, yearstr) => {
  const targetDir = path.join(dirPath, yearstr)
  return await readDirs( targetDir, /^[0-9][0-9]$/)
} 

const readDays = async(dirPath, yearstr, monthstr) => {
  const targetDir = path.join(dirPath, yearstr, monthstr)
  return await readDirs( targetDir, /^[0-9][0-9]$/)
}

const readFilePathsAt = async(dirPath, yearstr, monthstr, daystr) => {
  const targetPath = path.join(dirPath, yearstr, monthstr, daystr)
  const files = await fs.readdir(targetPath)
  return files
      .filter( fname => fname.match(/^[0-9]+\.md$/) )
      .sort( (a, b) => a < b ? 1 : -1)
      .map(fname => { return {fullPath: path.join(targetPath, fname), fname: fname} })
}


const fullPath2Date = (fullPath) => {
  return new Date(parseInt(path.basename(fullPath, ".md")))
}


/**
 * @typedef FilePath
 * @type {object}
 * @property {string} fullPath
 * @property {string} fname
 */


const readFilePaths = async(dirPath, count) => {
  const years = await readYears(dirPath)
    /** @type {FilePath[]} */
  let ret = []
  for (const year of years) {
      const months = await readMonths(dirPath, year)
      for (const month of months) {
          const days = await readDays(dirPath, year, month)
          for (const day of days) {
              const cur = await readFilePathsAt(dirPath, year, month, day)
              ret = ret.concat(cur)
              if (ret.length > count)
                  return ret
          }
      }
  }
  return ret
}

const readTextFile = async (path) => {
  return await fs.readFile(path, {encoding: "utf8" })
}

/**
 * @typedef Cell
 * @type {object}
 * @property {string} fullPath
 * @property {Date} date
 * @property {string} md
 */

const loadDir = async (dirPath, targetWin) => {
  const paths = await readFilePaths(dirPath, g_ITEM_LIMIT)
  const limited = paths.length <= g_ITEM_LIMIT ? paths : paths.slice(0, g_ITEM_LIMIT)
    /** @type {Cell[]} */
    const cells = await Promise.all(
      limited
      .map( async pathpair => {
          const date = new Date(parseInt(pathpair.fname.substring(0, pathpair.fname.length - 4)))
          const content = await readTextFile(pathpair.fullPath)
          return {fullPath: pathpair.fullPath, date: date, md: render(content, date)}
      })
  )

  const ret = renderCells(cells)
  targetWin.send("onLoadFullMd", ret)
}

const renderCell = (fullPath, innerHtml) => {
  return `<div class="box" fpath="${encode(fullPath)}">${innerHtml}</div>`
}

/**
 * 
 * @param {Cell[]} cells 
 * @returns 
 */
const renderCells = (cells)=> {
  const ret = []
  for(const cell of cells)
  {
      ret.push(renderCell(cell.fullPath, cell.md))
  }
  return ret.join("\n")
}

const saveRootDir = async(dir) => {
  store.set('root-path', dir)
}

const getRootDir = ()=> { return store.get('root-path') }

const openDirDialog = async (onSuccess) => {
  const {canceled, filePaths} = await dialog.showOpenDialog({
    properties: ['openDirectory']
  })
  if(!canceled) {
    saveRootDir(filePaths[0])
    onSuccess(filePaths[0])
  }
}

const isMac = process.platform === 'darwin'

const template = [
  ...(isMac ? [{ role: 'appMenu'}] : []),
  {
    label: 'File',
    submenu: [
        {
            label: "Open Root Dir",
            accelerator: 'CmdOrCtrl+O',
            click: async (item, focusedWindow)=> {
                openDirDialog(async(dir)=>{ 
                  await loadDir(dir, focusedWindow)                  
                })
            }
        },
        {
            label: "Open Recent",
            role: "recentDocuments",
            submenu: [
                {
                    label: "Clear Recent",
                    role: "clearRecentDocuments"
                }
            ]
        },
        isMac ? { role: 'close' } : { role: 'quit' }
    ]
  },
  { role: 'editMenu' },
  {
    label: 'View',
    submenu: [
      {
          label: 'Reload',
          accelerator: 'CmdOrCtrl+R',
          click: async (item, focusedWindow)=> {
            await loadDir(getRootDir(), focusedWindow)
          }
      },
      { type: 'separator' },
      { role: 'togglefullscreen' }
    ]
  },
  { role: 'windowMenu' },
  {
    label: 'Developer',
    submenu: [
        { role: 'toggleDevTools' }
    ]
  }
]
const createWindow = async ()=>{
  const winStat = windowStateKeeper({
      defaultWidth: 1000,
      defaultHeight: 800
  })
  const win = new BrowserWindow({
      x: winStat.x,
      y: winStat.y,
      width: winStat.width,
      height: winStat.height,
      webPreferences: {
          preload: path.join(__dirname, 'preload.js')
      }
  })
  winStat.manage(win)

  win.loadFile('index.html')

  win.webContents.on('will-navigate', (e, url)=> {
      console.log(url)
      e.preventDefault()
      shell.openExternal(url)
  })

  const rootPath = getRootDir()
  if (rootPath == null) {
      await openDirDialog(async(dir)=>{
        await loadDir(dir, win)
      })
  }
  else
  {
      await loadDir(rootPath, win)
  }
}


app.whenReady().then(async () => {
  const menu = Menu.buildFromTemplate(template)
  Menu.setApplicationMenu(menu)

  await createWindow()

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createWindow()
    }
  })
})

const zeroPad = (num) => {
  if (num >= 10)
      return num.toString()
  return "0" + num.toString()
}

const ensureDir = async (dir) => {
  try {
      await fs.access( dir, fs.constants.R_OK | fs.constants.W_OK )
  }
  catch(error) {
      await fs.mkdir( dir, { recursive: true } )
  }
}

const date2dir = (dt) => {
  return path.join(getRootDir(), dt.getFullYear().toString(), zeroPad(dt.getMonth()+1), zeroPad(dt.getDate()))
}

const date2fullPath = (dt) => {
  const targetDir = date2dir(dt)
  const fname = dt.getTime().toString() + ".md"
  return path.join(targetDir, fname)
}

const saveContent = async (dt, text)=>{
  const targetDir = date2dir(dt)
  await ensureDir(targetDir)

  const full = date2fullPath(dt)
  await fs.writeFile(full, text)
  return full
}

ipcMain.on('post', async (event, text)=> {
  const now = new Date()
  const full = await saveContent(now, text)

  event.sender.send("onLoadOneMd", full, render(text, now))
})

ipcMain.on("box-click", async(e, full) => {
  const content = await readTextFile(full)

  e.sender.send("startEdit", content)
})

ipcMain.on("submit", async(e, full, content) => {
  await fs.writeFile(full, content)
  e.sender.send("afterSubmit", full, render(content, fullPath2Date(full)))
})