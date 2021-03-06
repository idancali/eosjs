/* eslint-env mocha */
const assert = require('assert')

const Eos = require('.')

// even transactions that don't broadcast require Api lookups
//  no testnet yet, avoid breaking travis-ci
if(process.env['NODE_ENV'] === 'development') {

  describe('networks', () => {
    it('testnet', (done) => {
      const eos = Eos.Testnet()
      eos.getBlock(1, (err, block) => {
        if(err) {
          throw err
        }
        done()
      })
    })
  })

  describe('transactions', () => {
    const wif = '5KQwrPbwdL6PhXujxW37FSSQZ1JiwsST4cqQzDeyXtP79zkvFD3'
    const signProvider = ({sign, buf}) => sign(buf, wif)
    const promiseSigner = (args) => Promise.resolve(signProvider(args))

    it('usage', () => {
      const eos = Eos.Testnet({signProvider})
      eos.transfer()
    })

    it('keyProvider', () => {
      // Ultimatly keyProvider should return a string or array of private keys.
      // Optionally use a function and(or) return a promise if needed.
      // This is the more advanced case.
      const keyProvider = ({transaction}) => {
        assert.equal(transaction.messages[0].type, 'transfer')
        return Promise.resolve(wif)
      }

      const eos = Eos.Testnet({keyProvider})

      return eos.transfer('inita', 'initb', 1, '', false).then(tr => {
        assert.equal(tr.transaction.signatures.length, 1)
        assert.equal(typeof tr.transaction.signatures[0], 'string')
      })
    })

    it('signProvider', () => {
      const customSignProvider = ({buf, sign, transaction}) => {

        // All potential keys (EOS6MRy.. is the pubkey for 'wif')
        const pubkeys = ['EOS6MRyAjQq8ud7hVNYcfnVPJqcVpscN5So8BhtHuGYqET5GDW5CV']

        return eos.getRequiredKeys(transaction, pubkeys).then(res => {
          // Just the required_keys need to sign 
          assert.deepEqual(res.required_keys, pubkeys)
          return sign(buf, wif) // return hex string signature or array of signatures
        })
      }
      const eos = Eos.Testnet({signProvider: customSignProvider})
      return eos.transfer('inita', 'initb', 2, '', false)
    })

    it('newaccount (broadcast)', () => {
      const eos = Eos.Testnet({signProvider})
      const pubkey = 'EOS6MRyAjQq8ud7hVNYcfnVPJqcVpscN5So8BhtHuGYqET5GDW5CV'
      // const auth = {threshold: 1, keys: [{key: pubkey, weight: 1}], accounts: []}
      const name = randomName()

      return eos.newaccount({
        creator: 'inita',
        name,
        owner: pubkey,
        active: pubkey,
        recovery: 'inita',
        deposit: '1.0000 EOS'
      })
    })

    it('transfer (broadcast)', () => {
      const eos = Eos.Testnet({signProvider})
      return eos.transfer('inita', 'initb', 1, '')
    })

    it('transfer custom authorization (broadcast)', () => {
      const eos = Eos.Testnet({signProvider})
      return eos.transfer('inita', 'initb', 1, '', {authorization: 'inita@owner'})
    })

    it('transfer custom authorization sorting (no broadcast)', () => {
      const eos = Eos.Testnet({signProvider})
      return eos.transfer('inita', 'initb', 1, '',
        {authorization: ['initb@owner', 'inita@owner'], broadcast: false}
      ).then(({transaction}) => {
        const ans = [
          {account: 'inita', permission: 'owner'},
          {account: 'initb', permission: 'owner'}
        ]
        assert.deepEqual(transaction.messages[0].authorization, ans)
      })
    })

    it('transfer custom scope (broadcast)', () => {
      const eos = Eos.Testnet({signProvider})
      // To pass: initb, inita must get sorted to: inita, initb
      return eos.transfer('inita', 'initb', 2, '', {scope: ['initb', 'inita']})
    })

    it('transfer custom scope array (no broadcast)', () => {
      const eos = Eos.Testnet({signProvider})
      // To pass: scopes must get sorted
      return eos.transfer('inita', 'initb', 1, '',
        {scope: ['joe', 'billy'], broadcast: false}).then(({transaction}) => {
          assert.deepEqual(transaction.scope, ['billy', 'joe'])
        })
    })

    it('transfer (no broadcast)', () => {
      const eos = Eos.Testnet({signProvider})
      return eos.transfer('inita', 'initb', 1, '', {broadcast: false})
    })

    it('transfer (no broadcast, no sign)', () => {
      const eos = Eos.Testnet({signProvider})
      const opts = {broadcast: false, sign: false}
      return eos.transfer('inita', 'initb', 1, '', opts).then(tr => 
        assert.deepEqual(tr.transaction.signatures, [])
      )
    })

    it('transfer sign promise (no broadcast)', () => {
      const eos = Eos.Testnet({signProvider: promiseSigner})
      return eos.transfer('inita', 'initb', 1, '', false)
    })

    it('message to unknown contract', () => {
      const name = randomName()
      return Eos.Testnet({signProvider}).contract(name)
      .then(() => {throw 'expecting error'})
      .catch(error => {
        assert(/unknown key/.test(error.message))
      })
    })

    it('message to contract', () => {
      // initaPrivate = '5KQwrPbwdL6PhXujxW37FSSQZ1JiwsST4cqQzDeyXtP79zkvFD3'
      // eos is a bad test case, but it was the only native contract
      const name = 'eos'
      return Eos.Testnet({signProvider}).contract(name).then(contract => {
        contract.transfer('inita', 'initd', 1, '')
          // transaction sent on each command
          .then(tr => {assert.equal(1, tr.transaction.messages.length)})

        contract.transfer('initd', 'inita', 1, '')
          .then(tr => {assert.equal(1, tr.transaction.messages.length)})

      }).then(r => {assert(r == undefined)})
    })

    it('message to contract atomic', () => {
      let amt = 1 // for unique transactions
      const testnet = Eos.Testnet({signProvider})

      const trTest = eos => {
        assert(eos.transfer('inita', 'initf', amt, '') == null)
        assert(eos.transfer('initf', 'inita', amt++, '') == null)
      }

      const assertTr = test =>
        test.then(tr => {assert.equal(2, tr.transaction.messages.length)})
        
      //  contracts can be a string or array
      assertTr(testnet.transaction(['eos'], ({eos}) => trTest(eos)))
      assertTr(testnet.transaction('eos', eos => trTest(eos)))
    })

    it('message to contract (contract tr nesting)', () => {
      const tn = Eos.Testnet({signProvider})
      return tn.contract('eos').then(eos => {
        eos.transaction(tr => {
          tr.transfer('inita', 'initd', 1, '')
          tr.transfer('inita', 'inite', 1, '')
        })
        eos.transfer('inita', 'initf', 1, '')
      })
    })

    it('multi-message transaction (broadcast)', () => {
      const eos = Eos.Testnet({signProvider})
      return eos.transaction(tr => {
        assert(tr.transfer('inita', 'initb', 1, '') == null)
        assert(tr.transfer({from: 'inita', to: 'initc', amount: 1, memo: ''}) == null)
      })
      .then(tr => {
        assert.equal(2, tr.transaction.messages.length)
      })
    })

    it('multi-message transaction no inner callback', () => {
      const eos = Eos.Testnet({signProvider})
      eos.transaction(tr => {
        tr.okproducer('inita', 'inita', 1, cb => {})
      })
      .then(() => {throw 'expecting rollback'})
      .catch(error => {
        assert(/Callback during a transaction/.test(error), error)
      })
    })

    it('multi-message transaction error rollback', () => {
      const eos = Eos.Testnet({signProvider})
      return eos.transaction(tr => {throw 'rollback'})
      .then(() => {throw 'expecting rollback'})
      .catch(error => {
        assert(/rollback/.test(error), error)
      })
    })

    it('multi-message transaction Promise.reject rollback', () => {
      const eos = Eos.Testnet({signProvider})
      eos.transaction(tr => Promise.reject('rollback'))
      .then(() => {throw 'expecting rollback'})
      .catch(error => {
        assert(/rollback/.test(error), error)
      })
    })

    it('custom transfer', () => {
      const eos = Eos.Testnet({signProvider})
      return eos.transaction(
        {
          scope: ['inita', 'initb'],
          messages: [
            {
              code: 'eos',
              type: 'transfer',
              data: {
                from: 'inita',
                to: 'initb',
                amount: '13',
                memo: '爱'
              },
              authorization: [{
                account: 'inita',
                permission: 'active'
              }]
            }
          ]
        },
        {broadcast: false}
      )
    })

  })

} // if development

const randomName = () => 'a' +
  String(Math.round(Math.random() * 1000000000)).replace(/[0,6-9]/g, '')

