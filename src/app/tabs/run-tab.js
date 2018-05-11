'use strict'
var $ = require('jquery')
var yo = require('yo-yo')
var helper = require('../../lib/helper.js')
var remixLib = require('remix-lib')
var txExecution = remixLib.execution.txExecution
var txFormat = remixLib.execution.txFormat
var txHelper = remixLib.execution.txHelper
var executionContext = require('../../execution-context')
var modalDialogCustom = require('../ui/modal-dialog-custom')
var copyToClipboard = require('../ui/copy-to-clipboard')
var Recorder = require('../../recorder')
var EventManager = remixLib.EventManager
var addTooltip = require('../ui/tooltip')
var ethJSUtil = require('ethereumjs-util')
var MultiParamManager = require('../../multiParamManager')

var csjs = require('csjs-inject')
var css = require('./styles/run-tab-styles')
var request = require('request')

var instanceContainer = yo`<div class="${css.instanceContainer}"></div>`
var noInstancesText = yo`<div class="${css.noInstancesText}">0 contract Instances</div>`

var pendingTxsText = yo`<span>0 pending transactions</span>`

var net = yo`<span class=${css.network}></span>`
var detectNetworkTimeout

function runTab (appAPI = {}, appEvents = {}, opts = {}) {
  var container = yo`<div class="${css.runTabView}" id="runTabView" ></div>`
  var event = new EventManager()

  var clearInstanceElement = yo`<i class="${css.clearinstance} ${css.icon} fa fa-trash" title="Clear Instances List" aria-hidden="true"></i>`
  clearInstanceElement.addEventListener('click', () => {
    event.trigger('clearInstance', [])
  })
  var recorderInterface = makeRecorder(event, appAPI, appEvents, opts)
  var pendingTxsContainer = yo`
  <div class="${css.pendingTxsContainer}">
    <div class="${css.pendingTxsText}">
      ${pendingTxsText}
      <span class="${css.transactionActions}">
        ${recorderInterface.recordButton}
        ${recorderInterface.runButton}
        ${clearInstanceElement}
      </span>
    </div>
  </div>`

  var el = yo`
  <div>
    ${settings(container, appAPI, appEvents, opts)}
    ${contractDropdown(event, appAPI, appEvents, opts, instanceContainer)}
    ${pendingTxsContainer}
    ${instanceContainer}
  </div>
  `
  container.appendChild(el)

  // PENDING transactions
  function updatePendingTxs (container, appAPI) {
    var pendingCount = Object.keys(opts.udapp.pendingTransactions()).length
    pendingTxsText.innerText = pendingCount + ' pending transactions'
  }

  // DROPDOWN
  var selectExEnv = el.querySelector('#selectExEnvOptions')
  selectExEnv.addEventListener('change', function (evt) {
    let endpoint = selectExEnv.options[selectExEnv.selectedIndex].value
    setNetwork(endpoint, appAPI, opts, el, event)
  })
  // --------------- baas -----------------
  fillEnvironmentList(appAPI, opts, el, event)
  setInterval(() => {
    updateAccountBalances(container, appAPI)
    updatePendingTxs(container, appAPI)
  }, 10000)

  event.register('clearInstance', () => {
    instanceContainer.innerHTML = '' // clear the instances list
    noInstancesText.style.display = 'block'
    instanceContainer.appendChild(noInstancesText)
  })
  return { render () { return container } }
}
/**
 * 检查网络连接状态
**/
function detectNetwork () {
  executionContext.detectNetwork((err, { id, name } = {}) => {
    if (err) {
      modalDialogCustom.alert(err)
      net.innerHTML = `<i class="${css.networkItem} fa fa-ban ${css.errorIcon}"></i>`
    } else {
      net.innerHTML = `<i class="${css.networkItem} fa fa-plug ${css.successIcon}"></i> (${id || '-'})`
    }
    detectNetworkTimeout = setTimeout(detectNetwork, 5000)
  })
}
/**
 * 切换不同的网络环境
**/
function setNetwork (endpoint, appAPI, opts, el, event) {
  if (detectNetworkTimeout) {
    clearTimeout(detectNetworkTimeout)
  }
  const selectExEnv = el.querySelector('#selectExEnvOptions')
  selectExEnv.blur()
  selectExEnv.setAttribute('disabled', true)
  net.innerHTML = `<i class="${css.networkItem} fa fa-spinner fa-pulse"></i>`

  executionContext.setProviderFromEndpoint(endpoint, 'web3', (alertMsg) => {
    if (alertMsg) {
      modalDialogCustom.alert(alertMsg)
      net.innerHTML = `<i class="${css.networkItem} fa fa-exclamation-triangle ${css.errorIcon}"></i>`
    } else {
      detectNetwork()
      fillAccountsList(appAPI, opts, el)
      event.trigger('clearInstance', [])
    }
    selectExEnv.removeAttribute('disabled')
  })
}
/**
 * 从baas获取当前用户接入的测试网络
**/
function fillEnvironmentList (appAPI, opts, el, event) {
  const apiToken = appAPI.getAPIToken()
  const selectExEnv = el.querySelector('#selectExEnvOptions')
  if (apiToken) {
    request({
      url: 'https://api.baas.ink.plus/v1/public-chain/list',
      headers: {
        'Authorization': `Bearer ${apiToken}`
      },
      json: true
    }, (err, res, body) => {
      if (!err && res.statusCode === 200) {
        if (body.length) {
          let env = body.map(chain => ({
            network: chain.network,
            httpRPC: chain.httpRPC
          }))
          $(selectExEnv).empty()
          for (let e of env) {
            $(selectExEnv).append($('<option />').val(e.httpRPC).text(e.network))
          }
          setNetwork(env[0].httpRPC, appAPI, opts, el, event)
        } else {
          modalDialogCustom.alert('Need to join network first.')
        }
      } else {
        modalDialogCustom.alert(`BaaS load error: ${err || body.message}`)
      }
    })
  } else {
    modalDialogCustom.alert('Need API token.')
  }
}
/**
 * 获取账户信息
**/
function fillAccountsList (appAPI, opts, container) {
  var $txOrigin = $(container.querySelector('#txorigin'))
  $txOrigin.empty()
  opts.udapp.getAccounts((err, accounts) => {
    if (err) { addTooltip(`Cannot get account list: ${err}`) }
    if (accounts && accounts[0]) {
      for (var a in accounts) { $txOrigin.append($('<option />').val(accounts[a]).text(accounts[a])) }
      $txOrigin.val(accounts[0])
    } else {
      $txOrigin.val('unknown')
    }
  })
}
/**
 * 获取账户余额
**/
function updateAccountBalances (container, appAPI) {
  var accounts = $(container.querySelector('#txorigin')).children('option')
  accounts.each(function (index, value) {
    (function (acc) {
      appAPI.getBalance(accounts[acc].value, function (err, res) {
        if (!err) {
          accounts[acc].innerText = helper.shortenAddress(accounts[acc].value, res)
        }
      })
    })(index)
  })
}

/* ------------------------------------------------
    RECORDER
------------------------------------------------ */
function makeRecorder (events, appAPI, appEvents, opts) {
  var recorder = new Recorder(opts.compiler, {
    events: {
      udapp: appEvents.udapp,
      executioncontext: executionContext.event,
      runtab: events
    },
    api: appAPI
  })
  var css2 = csjs`
    .container,
    .runTxs,
    .recorder {
    }
  `

  var recordButton = yo`<i class="fa fa-floppy-o savetransaction ${css2.recorder} ${css.icon}" title="Save Transactions" aria-hidden="true"></i>`
  var runButton = yo`<i class="fa fa-play runtransaction ${css2.runTxs} ${css.icon}"  title="Run Transactions" aria-hidden="true"></i>`

  recordButton.onclick = () => {
    var txJSON = JSON.stringify(recorder.getAll(), null, 2)
    var path = appAPI.currentPath()
    modalDialogCustom.prompt(null, 'save ran transactions to file (e.g. `scenario.json`). The file is going to be saved under ' + path, 'scenario.json', input => {
      var fileProvider = appAPI.fileProviderOf(path)
      if (fileProvider) {
        var newFile = path + input
        helper.createNonClashingName(newFile, fileProvider, (error, newFile) => {
          if (error) return modalDialogCustom.alert('Failed to create file. ' + newFile + ' ' + error)
          if (!fileProvider.set(newFile, txJSON)) {
            modalDialogCustom.alert('Failed to create file ' + newFile)
          } else {
            appAPI.switchFile(newFile)
          }
        })
      }
    })
  }
  runButton.onclick = () => {
    var currentFile = appAPI.config.get('currentFile')
    appAPI.fileProviderOf(currentFile).get(currentFile, (error, json) => {
      if (error) {
        modalDialogCustom.alert('Invalid Scenario File ' + error)
      } else {
        if (currentFile.match('.json$')) {
          try {
            var obj = JSON.parse(json)
            var txArray = obj.transactions || []
            var accounts = obj.accounts || []
            var options = obj.options
            var abis = obj.abis
            var linkReferences = obj.linkReferences || {}
          } catch (e) {
            return modalDialogCustom.alert('Invalid Scenario File, please try again')
          }
          if (txArray.length) {
            noInstancesText.style.display = 'none'
            recorder.run(txArray, accounts, options, abis, linkReferences, opts.udapp, (abi, address, contractName) => {
              instanceContainer.appendChild(opts.udappUI.renderInstanceFromABI(abi, address, contractName))
            })
          }
        } else {
          modalDialogCustom.alert('A Scenario File is required. The file must be of type JSON. Use the "Save Transactions" Button to generate a  new Scenario File.')
        }
      }
    })
  }
  return { recordButton, runButton }
}
/* ------------------------------------------------
    section CONTRACT DROPDOWN and BUTTONS
------------------------------------------------ */

function contractDropdown (events, appAPI, appEvents, opts, instanceContainer) {
  instanceContainer.appendChild(noInstancesText)
  var compFails = yo`<i title="Contract compilation failed. Please check the compile tab for more information." class="fa fa-times-circle ${css.errorIcon}" ></i>`
  appEvents.compiler.register('compilationFinished', function (success, data, source) {
    getContractNames(success, data)
    if (success) {
      compFails.style.display = 'none'
      document.querySelector(`.${css.contractNames}`).classList.remove(css.contractNamesError)
    } else {
      compFails.style.display = 'block'
      document.querySelector(`.${css.contractNames}`).classList.add(css.contractNamesError)
    }
  })

  var atAddressButtonInput = yo`<input class="${css.input} ataddressinput" placeholder="Load contract from Address" title="atAddress" />`

  var selectContractNames = yo`<select class="${css.contractNames}" disabled></select>`

  function getSelectedContract () {
    var contractName = selectContractNames.children[selectContractNames.selectedIndex].innerHTML
    if (contractName) {
      return {
        name: contractName,
        contract: opts.compiler.getContract(contractName)
      }
    }
    return null
  }
  appAPI.getSelectedContract = getSelectedContract
  var createPanel = yo`<div class="${css.button}"></div>`

  var el = yo`
    <div class="${css.container}">
      <div class="${css.subcontainer}">
        ${selectContractNames} ${compFails}
      </div>
      <div class="${css.buttons}">
        ${createPanel}
        <div class="${css.button}">
          ${atAddressButtonInput}
          <div class="${css.atAddress}" onclick=${function () { loadFromAddress(appAPI) }}>At Address</div>
        </div>
      </div>
    </div>
  `

  function setInputParamsPlaceHolder () {
    createPanel.innerHTML = ''
    if (opts.compiler.getContract && selectContractNames.selectedIndex >= 0 && selectContractNames.children.length > 0) {
      var ctrabi = txHelper.getConstructorInterface(getSelectedContract().contract.object.abi)
      var createConstructorInstance = new MultiParamManager(0, ctrabi, (valArray, inputsValues) => {
        createInstance(inputsValues)
      }, txHelper.inputParametersDeclarationToString(ctrabi.inputs), 'Deploy')
      createPanel.appendChild(createConstructorInstance.render())
      return
    } else {
      createPanel.innerHTML = 'No compiled contracts'
    }
  }

  selectContractNames.addEventListener('change', setInputParamsPlaceHolder)

  // ADD BUTTONS AT ADDRESS AND CREATE
  function createInstance (args) {
    var selectedContract = getSelectedContract()

    if (selectedContract.contract.object.evm.bytecode.object.length === 0) {
      modalDialogCustom.alert('This contract does not implement all functions and thus cannot be created.')
      return
    }

    var constructor = txHelper.getConstructorInterface(selectedContract.contract.object.abi)
    txFormat.buildData(selectedContract.name, selectedContract.contract.object, opts.compiler.getContracts(), true, constructor, args, (error, data) => {
      if (!error) {
        appAPI.logMessage(`creation of ${selectedContract.name} pending...`)
        opts.udapp.createContract(data, (error, txResult) => {
          if (!error) {
            var isVM = executionContext.isVM()
            if (isVM) {
              var vmError = txExecution.checkVMError(txResult)
              if (vmError.error) {
                appAPI.logMessage(vmError.message)
                return
              }
            }
            noInstancesText.style.display = 'none'
            var address = isVM ? txResult.result.createdAddress : txResult.result.contractAddress
            instanceContainer.appendChild(opts.udappUI.renderInstance(selectedContract.contract.object, address, selectContractNames.value))
          } else {
            appAPI.logMessage(`creation of ${selectedContract.name} errored: ` + error)
          }
        })
      } else {
        appAPI.logMessage(`creation of ${selectedContract.name} errored: ` + error)
      }
    }, (msg) => {
      appAPI.logMessage(msg)
    }, (data, runTxCallback) => {
      // called for libraries deployment
      opts.udapp.runTx(data, runTxCallback)
    })
  }

  function loadFromAddress (appAPI) {
    noInstancesText.style.display = 'none'
    var contractNames = document.querySelector(`.${css.contractNames.classNames[0]}`)
    var address = atAddressButtonInput.value
    if (!ethJSUtil.isValidAddress(address)) {
      return modalDialogCustom.alert('Invalid address.')
    }
    if (/[a-f]/.test(address) && /[A-F]/.test(address) && !ethJSUtil.isValidChecksumAddress(address)) {
      return modalDialogCustom.alert('Invalid checksum address.')
    }
    if (/.(.abi)$/.exec(appAPI.currentFile())) {
      modalDialogCustom.confirm(null, 'Do you really want to interact with ' + address + ' using the current ABI definition ?', () => {
        var abi
        try {
          abi = JSON.parse(appAPI.editorContent())
        } catch (e) {
          return modalDialogCustom.alert('Failed to parse the current file as JSON ABI.')
        }
        instanceContainer.appendChild(opts.udappUI.renderInstanceFromABI(abi, address, address))
      })
    } else {
      var contract = opts.compiler.getContract(contractNames.children[contractNames.selectedIndex].innerHTML)
      instanceContainer.appendChild(opts.udappUI.renderInstance(contract.object, address, selectContractNames.value))
    }
  }

  // GET NAMES OF ALL THE CONTRACTS
  function getContractNames (success, data) {
    var contractNames = document.querySelector(`.${css.contractNames.classNames[0]}`)
    contractNames.innerHTML = ''
    if (success) {
      selectContractNames.removeAttribute('disabled')
      appAPI.visitContracts((contract) => {
        contractNames.appendChild(yo`<option>${contract.name}</option>`)
      })
    } else {
      selectContractNames.setAttribute('disabled', true)
    }
    setInputParamsPlaceHolder()
  }

  return el
}

/* ------------------------------------------------
    section SETTINGS: Environment, Account, Gas, Value
------------------------------------------------ */
function settings (container, appAPI, appEvents, opts) {
  function newAccount () {
    opts.udapp.newAccount('', (error, address) => {
      if (!error) {
        container.querySelector('#txorigin').appendChild(yo`<option value=${address}>${address}</option>`)
        addTooltip(`account ${address} created`)
      } else {
        addTooltip('Cannot create an account: ' + error)
      }
    })
  }
  var el = yo`
    <div class="${css.settings}">
      <div class="${css.crow}">
        <div id="selectExEnv" class="${css.col1_1}">
          Environment
        </div>
        <div class=${css.environment}>
          ${net}
          <select id="selectExEnvOptions" class="${css.select}"></select>
          <a href="https://github.com/ethereum/EIPs/blob/master/EIPS/eip-155.md" target="_blank"><i class="${css.icon} fa fa-info"></i></a>
        </div>
      </div>
      <div class="${css.crow}">
        <div class="${css.col1_1}">Account</div>
        <select name="txorigin" class="${css.select}" id="txorigin"></select>
          ${copyToClipboard(() => document.querySelector('#runTabView #txorigin').value)}
          <i class="fa fa-plus-square-o ${css.createAccount} ${css.icon}" aria-hidden="true" onclick=${newAccount} title="Create a new account"></i>
      </div>
      <div class="${css.crow}">
        <div class="${css.col1_1}">Gas limit</div>
        <input type="number" class="${css.col2}" id="gasLimit" value="3000000">
      </div>
      <div class="${css.crow}" style="display: none">
        <div class="${css.col1_1}">Gas Price</div>
        <input type="number" class="${css.col2}" id="gasPrice" value="0">
      </div>
      <div class="${css.crow}">
        <div class="${css.col1_1}">Value</div>
        <input type="text" class="${css.col2_1}" id="value" value="0" title="Enter the value and choose the unit">
        <select name="unit" class="${css.col2_2}" id="unit">
          <option data-unit="wei">wei</option>
          <option data-unit="gwei">gwei</option>
          <option data-unit="finney">finney</option>
          <option data-unit="ether">ether</option>
        </select>
      </div>
    </div>
  `
  // EVENTS
  appEvents.udapp.register('transactionExecuted', (error, from, to, data, lookupOnly, txResult) => {
    if (error) return
    if (!lookupOnly) el.querySelector('#value').value = '0'
    updateAccountBalances(container, appAPI)
  })

  return el
}

module.exports = runTab
