var yo = require('yo-yo')
var csjs = require('csjs-inject')
var remixLib = require('remix-lib')
var PluginManager = require('../plugin/pluginManager')
var TabbedMenu = require('../tabs/tabbed-menu')
var CompileTab = require('../tabs/compile-tab')
var SettingsTab = require('../tabs/settings-tab')
var AnalysisTab = require('../tabs/analysis-tab')
var DebuggerTab = require('../tabs/debugger-tab')
var SupportTab = require('../tabs/support-tab')
var PluginTab = require('../tabs/plugin-tab')
// var TestTab = require('../tabs/test-tab')
var RunTab = require('../tabs/run-tab')

var EventManager = remixLib.EventManager
var styles = remixLib.ui.themeChooser.chooser()

module.exports = class RighthandPanel {
  constructor (api = {}, events = {}, opts = {}) {
    const self = this
    self.event = new EventManager()

    self._api = api
    self._api.switchTab = x => self._components.tabbedMenu.switchTab(x)

    self._events = events
    self._events.rhp = self.event

    self._view = { el: null, tabbedMenu: null, tabbedMenuViewport: null, dragbar: null }
    self._components = {}
    self._components.pluginManager = new PluginManager(self._api, self._events)
    self._components.tabbedMenu = new TabbedMenu(self._api, self._events)
    self._components.tabbedMenu.addTab('Compile', 'compileView', (new CompileTab(opts)).render())
    self._components.tabbedMenu.addTab('Run', 'runView', (new RunTab(opts)).render())
    self._components.tabbedMenu.addTab('Settings', 'settingsView', (new SettingsTab(opts)).render())
    self._components.tabbedMenu.addTab('Analysis', 'staticanalysisView', (new AnalysisTab(opts)).render())
    self._components.tabbedMenu.addTab('Debugger', 'debugView', (new DebuggerTab(opts)).render())
    // self._components.tabbedMenu.addTab('Tests', 'testView', (new TestTab(opts)).render())
    self._components.tabbedMenu.addTab('Support', 'supportView', (new SupportTab(opts)).render())
    self._components.tabbedMenu.selectTabByTitle('Compile')

    self.event.register('plugin-loadRequest', (json) => {
      var pluginTab = new PluginTab(json)
      var content = pluginTab.render()
      self._components.tabbedMenu.addTab(json.title, 'plugin', content)
      self._components.pluginManager.register(json, content)
    })
  }
  showDebugger () {
    const self = this
    if (!self._components.tabbedMenu) return
    self._components.tabbedMenu.selectTab(self._view.el.querySelector('li.debugView'))
  }
  render () {
    const self = this
    if (self._view.el) return self._view.el
    self._view.tabbedMenu = self._components.tabbedMenu.render()
    self._view.tabbedMenuViewport = self._components.tabbedMenu.renderViewport()
    self._view.dragbar = yo`<div id="dragbar" class=${css.dragbar}></div>`
    self._view.el = yo`
      <div id="righthand-panel" class=${css.righthandpanel}>
        ${self._view.dragbar}
        <div id="header" class=${css.header}>
          ${self._view.tabbedMenu}
          ${self._view.tabbedMenuViewport}
        </div>
      </div>
    `
    return self._view.el
  }
  init () {
    // @TODO: init is for resizable drag bar only and should be refactored in the future
    const self = this
    var limit = 60
    self._view.dragbar.addEventListener('mousedown', mousedown)
    var ghostbar = yo`<div class=${css.ghostbar}></div>`
    function mousedown (event) {
      event.preventDefault()
      if (event.which === 1) {
        moveGhostbar(event)
        document.body.appendChild(ghostbar)
        document.addEventListener('mousemove', moveGhostbar)
        document.addEventListener('mouseup', removeGhostbar)
        document.addEventListener('keydown', cancelGhostbar)
      }
    }
    function cancelGhostbar (event) {
      if (event.keyCode === 27) {
        document.body.removeChild(ghostbar)
        document.removeEventListener('mousemove', moveGhostbar)
        document.removeEventListener('mouseup', removeGhostbar)
        document.removeEventListener('keydown', cancelGhostbar)
      }
    }
    function getPosition (event) {
      var lhp = window['filepanel'].offsetWidth
      var max = document.body.offsetWidth - limit
      var newpos = (event.pageX > max) ? max : event.pageX
      newpos = (newpos > (lhp + limit)) ? newpos : lhp + limit
      return newpos
    }
    function moveGhostbar (event) { // @NOTE VERTICAL ghostbar
      ghostbar.style.left = getPosition(event) + 'px'
    }
    function removeGhostbar (event) {
      document.body.removeChild(ghostbar)
      document.removeEventListener('mousemove', moveGhostbar)
      document.removeEventListener('mouseup', removeGhostbar)
      document.removeEventListener('keydown', cancelGhostbar)
      self.event.trigger('resize', [document.body.offsetWidth - getPosition(event)])
    }
  }
}
const css = csjs`
  .righthandpanel      {
    display            : flex;
    flex-direction     : column;
    top                : 0;
    right              : 0;
    bottom             : 0;
    box-sizing         : border-box;
    overflow           : hidden;
    height             : 100%;
  }
  .header              {
    height             : 100%;
  }
  .dragbar             {
    position           : absolute;
    width              : 0.5em;
    top                : 3em;
    bottom             : 0;
    cursor             : col-resize;
    z-index            : 999;
    border-left        : 2px solid ${styles.rightPanel.bar_Dragging};
  }
  .ghostbar           {
    width             : 3px;
    background-color  : ${styles.rightPanel.bar_Ghost};
    opacity           : 0.5;
    position          : absolute;
    cursor            : col-resize;
    z-index           : 9999;
    top               : 0;
    bottom            : 0;
  }
`
