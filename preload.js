const {ipcRenderer} = require('electron')


window.addEventListener('DOMContentLoaded', (_)=> {
    /** @type {HTMLDivElement} */
    const contentRootDiv = document.getElementById('content-root')
    /** @type {HTMLDivElement} */
    const postDiv = document.getElementById("post-div")
    /** @type {HTMLTextAreaElement} */
    const postArea = postDiv.querySelector("#post-area")  
    /** @type {HTMLDivElement} */
    const editDiv = document.getElementById("edit-div")
    /** @type {HTMLTextAreaElement} */
    const editArea = editDiv.querySelector("#edit-area")


    const postEdit = () => {
        ipcRenderer.send('post', postArea.value)
    }

    ipcRenderer.on('onLoadOneMd', (event, fullPath, innerHTML) => {
      postArea.value = ""

      const newDiv = document.createElement("div")
      newDiv.className = "box"
      newDiv.setAttribute("fpath", fullPath)
      newDiv.innerHTML = innerHTML
      contentRootDiv.insertBefore(newDiv, contentRootDiv.firstChild)
    })

    ipcRenderer.on('onLoadFullMd', (event, md) => {
      contentRootDiv.innerHTML = md        
    })


    document.getElementById('submit-post').addEventListener('click', postEdit)

    postArea.addEventListener('keydown', (event)=>{
      if((event.keyCode == 10 || event.keyCode == 13)
        && (event.ctrlKey || event.metaKey)) {
        postEdit()        
      }
    })

    /** @type {HTMLDivElement} */
    let lastSelected = null
    let targetFullPath = ""

    const onBodyClick = (event) => {
      const findTargetElem = (start) => {
        if (start.tagName == "body")
            return null
        if (start == contentRootDiv)
            return null
        let cur = start
        while (cur != contentRootDiv) {
            const fpath = cur.getAttribute('fpath')
            if (fpath != null)
                return cur
            cur = cur.parentElement
        
            // not contentRootDiv child
            if (cur == null)
                return null
        }
        return null
      }

      let topelem = findTargetElem(event.target) 
      if (!topelem)
        return
      const fpath = topelem.getAttribute('fpath')
      lastSelected = topelem
      targetFullPath = fpath
      ipcRenderer.send("box-click", fpath)
    }


    const body = document.body
    body.addEventListener('click', onBodyClick) 
    
    document.getElementById('cancel-edit').addEventListener('click', ()=>{
        editDiv.style.display = 'none'
    })

    const submitEdit = ()=> {
        ipcRenderer.send('submit', targetFullPath, editArea.value)
        editDiv.style.display = 'none'
    }
    
    document.getElementById('submit-edit').addEventListener('click', ()=>{
        submitEdit()
    })

    ipcRenderer.on('afterSubmit', (event, fullPath, innerHTML) => {
      lastSelected.innerHTML = innerHTML
    })

    
    editArea.addEventListener('keydown', (event)=>{
        if((event.keyCode == 10 || event.keyCode == 13)
            && (event.ctrlKey || event.metaKey)) {
            submitEdit()        
        }
    })

    /**
     * Edit cell.
     * @param {string} content 
     */
    ipcRenderer.on('startEdit', (event, content) => {
      lastSelected.insertAdjacentElement('afterend', editDiv)
      editArea.value = content
      const lineNum = content.split("\n").length
      editArea.rows = Math.max(lineNum, 3);
      editDiv.style.display = 'block'

    })
})