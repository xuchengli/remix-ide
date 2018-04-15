var yo = require('yo-yo')
var csjs = require('csjs-inject')

var TreeView = require('../ui/TreeView')
var modalDialog = require('../ui/modaldialog')
var copyToClipboard = require('../ui/copy-to-clipboard')
var modalDialogCustom = require('../ui/modal-dialog-custom')
var styleGuide = require('../ui/styles-guide/theme-chooser')
var parseContracts = require('../contract/contractParser')
var publishOnSwarm = require('../contract/publishOnSwarm')
var styles = styleGuide.chooser()

module.exports = class CompileTab {
  constructor (api = {}, events = {}, opts = {}) {
    const self = this
    self._opts = opts
    self._api = api
    self._events = events
    self.data = {}
    self.data.compileTimeout = null
    self.data.autoCompile = self._api.config.get('autoCompile') || false
    self.data.contractsDetails = {}
    self._events.editor.register('contentChanged', scheduleCompilation)
    self._events.editor.register('sessionSwitched', scheduleCompilation)
    function scheduleCompilation () {
      if (!self._api.config.get('autoCompile')) return
      if (self.data.compileTimeout) window.clearTimeout(self.data.compileTimeout)
      self.data.compileTimeout = window.setTimeout(() => self._api.runCompiler(), 300)
    }
    self._events.compiler.register('compilationDuration', function tabHighlighting (speed) {
      if (speed > 1000) {
        self._view.warnCompilationSlow.setAttribute('title', `Last compilation took ${speed}ms. We suggest to turn off autocompilation.`)
        self._view.warnCompilationSlow.style.display = 'inline-block'
      } else {
        self._view.warnCompilationSlow.style.display = 'none'
      }
    })
    // loadingCompiler
    self._events.editor.register('contentChanged', function changedFile () {
      var compileTab = document.querySelector('.compileView') // @TODO: compileView tab
      compileTab.style.color = styles.colors.red  // @TODO: compileView tab
      self._view.compileIcon.classList.add(`${css.bouncingIcon}`)  // @TODO: compileView tab
    })
    self._events.compiler.register('loadingCompiler', function start () {
      self._view.compileIcon.classList.add(`${css.spinningIcon}`)
      self._view.warnCompilationSlow.style.display = 'none'
      self._view.compileIcon.setAttribute('title', 'compiler is loading, please wait a few moments.')
    })
    self._events.compiler.register('compilationStarted', function start () {
      self._view.errorContainer.innerHTML = ''
      self._view.compileIcon.classList.remove(`${css.bouncingIcon}`)
      self._view.compileIcon.classList.add(`${css.spinningIcon}`)
      self._view.compileIcon.setAttribute('title', 'compiling...')
    })
    self._events.compiler.register('compilerLoaded', function loaded () {
      self._view.compileIcon.classList.remove(`${css.spinningIcon}`)
      self._view.compileIcon.setAttribute('title', '')
    })
    self._events.compiler.register('compilationFinished', function finish (success, data, source) {
      // reset icon and tab
      var compileTab = document.querySelector('.compileView') // @TODO: compileView tab
      compileTab.style.color = styles.colors.black // @TODO: compileView tab
      self._view.compileIcon.style.color = styles.colors.black
      self._view.compileIcon.classList.remove(`${css.spinningIcon}`)
      self._view.compileIcon.classList.remove(`${css.bouncingIcon}`)
      self._view.compileIcon.setAttribute('title', 'idle')
      // reset the contractMetadata list (used by the publish action)
      self.data.contractsDetails = {}
      // refill the dropdown list
      self._view.contractNames.innerHTML = ''
      if (success) {
        self._view.contractNames.removeAttribute('disabled')
        self._api.visitContracts((contract) => {
          self.data.contractsDetails[contract.name] = parseContracts(contract.name, contract.object, self._api.getSource(contract.file))
          self._view.contractNames.appendChild(yo`<option>${contract.name}</option>`)
        })
        self._api.resetDapp(self.data.contractsDetails)
      } else {
        self._view.contractNames.setAttribute('disabled', true)
        self._api.resetDapp({})
      }
      // hightlight the tab if error
      document.querySelector('.compileView').style.color = success ? '' : styles.colors.red  // @TODO: compileView tab

      if (data['error']) {
        var errors = [].concat(data['errors'])
        errors.forEach(err => self._opts.renderer.error(err.formattedMessage, self._view.errorContainer, {type: err.severity}))
      } else if (data.contracts) {
        self._api.visitContracts((contract) => self._opts.renderer.error(contract.name, self._view.errorContainer, {type: 'success'}))
      }
    })
    self._events.staticAnalysis.register('staticAnaysisWarning', (count) => {
      if (!count) return
      self._opts.renderer.error(`Static Analysis raised ${count} warning(s) that requires your attention.`, self._view.errorContainer, {
        type: 'warning',
        click: () => self._api.switchTab('staticanalysisView')
      })
    })
  }
  render () {
    const self = this
    if (self._view.el) return self._view.el
    self._view.warnCompilationSlow = yo`<i title="Copy Address" style="display:none" class="${css.warnCompilationSlow} fa fa-exclamation-triangle" aria-hidden="true"></i>`
    self._view.compileIcon = yo`<i class="fa fa-refresh ${css.icon}" aria-hidden="true"></i>`
    self._view.autoCompileInput = yo`<input class="${css.autocompile}" onchange=${onswitchAutocompile} id="autoCompile" type="checkbox" title="Auto compile">`
    if (self.data.autoCompile) self._view.autoCompileInput.setAttribute('checked', 'checked')
    self._view.compileContainer = yo`
      <div class="${css.compileContainer}" onclick=${onrunCompiler}>
        <div class="${css.compileButtons}">
          <div class="${css.compileButton} "id="compile" title="Compile source code">${self._view.compileIcon} Start to compile</div>
          <div class="${css.autocompileContainer}">
            ${self._view.autoCompileInput}
            <span class="${css.autocompileText}">Auto compile</span>
          </div>
          ${self._view.warnCompilationSlow}
        </div>
      </div>`
    self._view.errorContainer = yo`<div class='error'></div>`
    self._view.select = yo`<select class="${css.contractNames}" disabled></select>`
    self._view.contractNames = yo`
      <div class="${css.container}">
        ${self._view.select}
        <div class="${css.contractButtons}">
          <div title="Display Contract Details" class="${css.details}" onclick=${ondetails}>Details</div>
          <div title="Publish on Swarm" class="${css.publish}" onclick=${onpublish}>Publish on Swarm</div>
        </div>
      </div>`
    self._view.el = yo`
      <div class="${css.compileTabView}" id="compileTabView">
        ${self._view.compileContainer}
        ${self._view.contractNames}
        ${self._view.errorContainer}
      </div>`
    const detailsHelpSection = {
      'Assembly': 'Assembly opcodes describing the contract including corresponding solidity source code',
      'Opcodes': 'Assembly opcodes describing the contract',
      'Runtime Bytecode': 'Bytecode storing the state and being executed during normal contract call',
      'bytecode': 'Bytecode being executed during contract creation',
      'functionHashes': 'List of declared function and their corresponding hash',
      'gasEstimates': 'Gas estimation for each function call',
      'metadata': 'Contains all informations related to the compilation',
      'metadataHash': 'Hash representing all metadata information',
      'abi': 'ABI: describing all the functions (input/output params, scope, ...)',
      'name': 'Name of the compiled contract',
      'swarmLocation': 'Swarm url where all metadata information can be found (contract needs to be published first)',
      'web3Deploy': 'Copy/paste this code to any JavaScript/Web3 console to deploy this contract'
    }
    return self._view.el
    function ondetails () {
      var select = self._view.select
      if (select.children.length > 0 && select.selectedIndex >= 0) {
        var contractName = select.children[select.selectedIndex].innerHTML
        var contractProperties = self.data.contractsDetails[contractName]
        var logs = yo`
          <div class="${css.detailsJSON}">
            ${Object.keys(contractProperties).map(propertyName => yo`
              <div class=${css.log}>
                <div class="${css.key}">${propertyName}
                  <span class="${css.copyDetails}">
                    ${copyToClipboard(() => contractProperties[propertyName])}
                  </span>
                  <span class="${css.questionMark}">
                    <i title="${detailsHelpSection[propertyName]}" class="fa fa-question-circle" aria-hidden="true"></i>
                  </span>
                </div>
                ${insertValue(contractProperties, propertyName)}
              </div>
            `)}
          </div>`
        modalDialog(contractName, logs, {label: ''}, {label: 'Close'})
      }
    }
    function onswitchAutocompile (event) {
      self._api.config.set('autoCompile', self._view.autoCompileInput.checked)
    }
    function onpublish () {
      var selectContractNames = self._view.contractNames
      if (selectContractNames.children.length > 0 && selectContractNames.selectedIndex >= 0) {
        var contract = self.data.contractsDetails[selectContractNames.children[selectContractNames.selectedIndex].innerHTML]
        if (contract.metadata === undefined || contract.metadata.length === 0) {
          modalDialogCustom.alert('This contract does not implement all functions and thus cannot be published.')
        } else {
          publishOnSwarm(contract, self._api, function (err) {
            if (err) {
              try {
                err = JSON.stringify(err)
              } catch (e) {}
              modalDialogCustom.alert(yo`<span>Failed to publish metadata file to swarm, please check the Swarm gateways is available ( swarm-gateways.net ).<br />
              ${err}</span>`)
            } else {
              modalDialogCustom.alert(yo`<span>Metadata published successfully.<br />The Swarm address of the metadata file is available in the contract details.</span>`)
            }
          }, function (item) {
            // triggered each time there's a new verified publish (means hash correspond)
            self._api.fileProvider('swarm').addReadOnly(item.hash, item.content)
          })
        }
      }
    }
    function onrunCompiler (event) { self._api.runCompiler() }
    function insertValue (details, propertyName) {
      var value = yo`<pre class="${css.value}"></pre>`
      var node
      if (propertyName === 'web3Deploy' || propertyName === 'name' || propertyName === 'Assembly') {
        node = yo`<pre>${details[propertyName]}</pre>`
      } else if (propertyName === 'abi' || propertyName === 'metadata') {
        var treeView = new TreeView({
          extractData: function (item, parent, key) {
            var ret = {}
            if (item instanceof Array) {
              ret.children = item.map((item, index) => {
                return {key: index, value: item}
              })
              ret.self = ''
            } else if (item instanceof Object) {
              ret.children = Object.keys(item).map((key) => {
                return {key: key, value: item[key]}
              })
              ret.self = ''
            } else {
              ret.self = item
              ret.children = []
            }
            return ret
          }
        })
        if (details[propertyName] !== '') {
          try {
            node = yo`<div>${treeView.render(typeof details[propertyName] === 'object' ? details[propertyName] : JSON.parse(details[propertyName]))}</div>` // catch in case the parsing fails.
          } catch (e) {
            node = yo`<div>Unable to display "${propertyName}": ${e.message}</div>`
          }
        } else {
          node = yo`<div> - </div>`
        }
      } else {
        node = yo`<div>${JSON.stringify(details[propertyName], null, 4)}</div>`
      }
      if (node) value.appendChild(node)
      return value
    }
  }
}

const css = csjs`
  .compileTabView {
    padding: 2%;
  }
  .contract {
    display: block;
    margin: 3% 0;
  }
  .compileContainer  {
    ${styles.rightPanel.compileTab.box_CompileContainer};
    margin-bottom: 2%;
  }
  .autocompileContainer {
    width: 90px;
    display: flex;
    align-items: center;
  }
  .autocompile {}
  .autocompileTitle {
    font-weight: bold;
    margin: 1% 0;
  }
  .autocompileText {
    margin: 1% 0;
    font-size: 12px;
    overflow: hidden;
    word-break: normal;
    line-height: initial;
  }
  .warnCompilationSlow {
    color: ${styles.rightPanel.compileTab.icon_WarnCompilation_Color};
    margin-left: 1%;
  }
  .compileButtons {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
  }
  .name {
    display: flex;
  }
  .size {
    display: flex;
  }
  .compileButton {
    ${styles.rightPanel.compileTab.button_Compile};
    width: 120px;
    min-width: 110px;
    margin-right: 1%;
    font-size: 12px;
  }
  .container {
    ${styles.rightPanel.compileTab.box_CompileContainer};
    margin: 0;
    display: flex;
    align-items: center;
  }
  .contractNames {
    ${styles.rightPanel.compileTab.dropdown_CompileContract};
    margin-right: 5%;
  }
  .contractButtons {
    display: flex;
    cursor: pointer;
    justify-content: center;
    text-align: center;
  }
  .details {
    ${styles.rightPanel.compileTab.button_Details};
  }
  .publish {
    ${styles.rightPanel.compileTab.button_Publish};
    margin-left: 2%;
    width: 120px;
  }
  .log {
    ${styles.rightPanel.compileTab.box_CompileContainer};
    display: flex;
    flex-direction: column;
    margin-bottom: 5%;
    overflow: visible;
  }
  .key {
    margin-right: 5px;
    color: ${styles.rightPanel.text_Primary};
    text-transform: uppercase;
    width: 100%;
  }
  .value {
    display: flex;
    width: 100%;
    margin-top: 1.5%;
  }
  .questionMark {
    margin-left: 2%;
    cursor: pointer;
    color: ${styles.rightPanel.icon_Color_TogglePanel};
  }
  .questionMark:hover {
    color: ${styles.rightPanel.icon_HoverColor_TogglePanel};
  }
  .detailsJSON {
    padding: 8px 0;
    background-color: ${styles.rightPanel.modalDialog_BackgroundColor_Primary};
    border: none;
    color: ${styles.rightPanel.modalDialog_text_Secondary};
  }
  .icon {
    margin-right: 3%;
  }
  .spinningIcon {
    margin-right: .3em;
    animation: spin 2s linear infinite;
  }
  .bouncingIcon {
    margin-right: .3em;
    animation: bounce 2s infinite;
  }
  @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
  }
  @-webkit-keyframes bounce {
  0% {
    margin-bottom: 0;
    color: ${styles.colors.transparent};
  }
  70% {
    margin-bottom: 0;
    color: ${styles.rightPanel.text_Secondary};
  }
  100% {
    margin-bottom: 0;
    color: ${styles.colors.transparent};
  }
}
`
