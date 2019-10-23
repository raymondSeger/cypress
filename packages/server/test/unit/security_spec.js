require('../spec_helper')

const _ = require('lodash')
const rp = require('request-promise')
const concat = require('concat-stream')
const fs = require(`${root}lib/util/fs`)
const security = require(`${root}lib/util/security`)
const Fixtures = require(`${root}test/support/helpers/fixtures`)

const original = `\
<html>
  <body>
    top1
    settop
    settopbox
    parent1
    grandparent
    grandparents
    topFoo
    topFoo.window
    topFoo.window != topFoo
    parentFoo
    parentFoo.window
    parentFoo.window != parentFoo

    <div style="left: 1500px; top: 0px;"></div>
    <div style="left: 1500px; top : 0px;"></div>
    <div style="left: 1500px; top  : 0px;"></div>

    parent()
    foo.parent()
    top()
    foo.top()
    foo("parent")
    foo("top")

    const parent = () => { bar: 'bar' }

    parent.bar

    <script type="text/javascript">
      if (top != self) run()
      if (top!=self) run()
      if (self !== top) run()
      if (self!==top) run()
      if (self === top) return
      if (top.location!=self.location&&(top.location.href=self.location.href)) run()
      if (top.location != self.location) run()
      if (top.location != location) run()
      if (self.location != top.location) run()
      if (parent.frames.length > 0) run()
      if (window != top) run()
      if (window.top !== window.self) run()
      if (window.top!==window.self) run()
      if (window.self != window.top) run()
      if (window.top != window.self) run()
      if (window["top"] != window["parent"]) run()
      if (window['top'] != window['parent']) run()
      if (window["top"] != self['parent']) run()
      if (parent && parent != window) run()
      if (parent && parent != self) run()
      if (parent && window != parent) run()
      if (parent && self != parent) run()
      if (parent && parent.frames && parent.frames.length > 0) run()
      if ((self.parent && !(self.parent === self)) && (self.parent.frames.length != 0)) run()
      if (parent !== null && parent.tag !== 'HostComponent' && parent.tag !== 'HostRoot') { }
      if (null !== parent && parent.tag !== 'HostComponent' && parent.tag !== 'HostRoot') { }
      if (top===self) return
      if (top==self) return
    </script>
  </body>
</html>\
`

const expected = `\
<html>
  <body>
    top1
    settop
    settopbox
    parent1
    grandparent
    grandparents
    topFoo
    topFoo.window
    topFoo.window != topFoo
    parentFoo
    parentFoo.window
    parentFoo.window != parentFoo

    <div style="left: 1500px; top: 0px;"></div>
    <div style="left: 1500px; top : 0px;"></div>
    <div style="left: 1500px; top  : 0px;"></div>

    parent()
    foo.parent()
    top()
    foo.top()
    foo("parent")
    foo("top")

    const parent = () => { bar: 'bar' }

    parent.bar

    <script type="text/javascript">
      if (self != self) run()
      if (self!=self) run()
      if (self !== self) run()
      if (self!==self) run()
      if (self === self) return
      if (self.location!=self.location&&(self.location.href=self.location.href)) run()
      if (self.location != self.location) run()
      if (self.location != location) run()
      if (self.location != self.location) run()
      if (self.frames.length > 0) run()
      if (window != self) run()
      if (window.self !== window.self) run()
      if (window.self!==window.self) run()
      if (window.self != window.self) run()
      if (window.self != window.self) run()
      if (window["self"] != window["self"]) run()
      if (window['self'] != window['self']) run()
      if (window["self"] != self['self']) run()
      if (parent && self != window) run()
      if (parent && self != self) run()
      if (parent && window != self) run()
      if (parent && self != self) run()
      if (parent && self.frames && self.frames.length > 0) run()
      if ((self.parent && !(self.self === self)) && (self.self.frames.length != 0)) run()
      if (parent !== null && parent.tag !== 'HostComponent' && parent.tag !== 'HostRoot') { }
      if (null !== parent && parent.tag !== 'HostComponent' && parent.tag !== 'HostRoot') { }
      if (self===self) return
      if (self==self) return
    </script>
  </body>
</html>\
`

function match (varName, prop) {
  return `(window.top.Cypress.resolveWindowReference(window, ${varName}, '${prop}'))`
}

describe('lib/util/security', () => {
  context('.strip', () => {
    context('injects Cypress window property resolver', () => {
      [
        ['window.top', match('window', 'top')],
        ['window.parent', match('window', 'parent')],
        ['window[\'top\']', match('window', 'top')],
        ['window[\'parent\']', match('window', 'parent')],
        ['window["top"]', match('window', 'top')],
        ['window["parent"]', match('window', 'parent')],
        ['foowindow.top', match('foowindow', 'top')],
        ['foowindow[\'top\']', match('foowindow', 'top')],
        ['window.topfoo'],
        ['window[\'topfoo\']'],
        ['window.top.foo', `${match('window', 'top')}.foo`],
        ['window[\'top\'].foo', `${match('window', 'top')}.foo`],
        ['window.top["foo"]', `${match('window', 'top')}["foo"]`],
        ['window[\'top\']["foo"]', `${match('window', 'top')}["foo"]`],
        [
          'if (window["top"] != window["parent"]) run()',
          `if (${match('window', 'top')} != ${match('window', 'parent')}) run()`,
        ],
        [
          'if (top != self) run()',
          `if ((top === window['top'] ? ${match('window', 'top')} : top) != self) run()`,
        ],
        [
          'if (window != top) run()',
          `if (window != (top === window['top'] ? ${match('window', 'top')} : top)) run()`,
        ],
        [
          'if (top.location != self.location) run()',
          `if (${match('top', 'location')} != ${match('self', 'location')}) run()`,
        ],
        // fun construct found in Apple's analytics code
        [
          'n = (c = n).parent',
          `n = ${match('(c = n)', 'parent')}`,
        ],
      ].forEach(([string, expected]) => {
        if (!expected) {
          expected = string
        }

        it(`${string} => ${expected}`, () => {
          const actual = security.strip(string)

          expect(actual).to.eq(expected)
        })
      })
    })

    // TODO: needs to be updated
    it.skip('replaces obstructive code', () => {
      expect(security.strip(original)).to.eq(expected)
    })

    it('replaces jira window getter', () => {
      const jira = `\
for (; !function (n) {
  return n === n.parent
}(n);) {}\
`

      const jira2 = `\
(function(n){for(;!function(l){return l===l.parent}(l)&&function(l){try{if(void 0==l.location.href)return!1}catch(l){return!1}return!0}(l.parent);)l=l.parent;return l})\
`

      expect(security.strip(jira)).to.eq(`\
for (; !function (n) {
  return n === ${match('n', 'parent')}
}(n);) {}\
`)

      expect(security.strip(jira2)).to.eq(`\
(function(n){for(;!function(l){return l===${match('l', 'parent')}}(l)&&function(l){try{if(void 0==${match('l', 'location')}.href)return!1}catch(l){return!1}return!0}(${match('l', 'parent')});)l=${match('l', 'parent')};return l})\
`)
    })

    describe('libs', () => {

      const cdnUrl = 'https://cdnjs.cloudflare.com/ajax/libs'

      const needsDash = ['backbone', 'underscore']

      let libs = {
        jquery: `${cdnUrl}/jquery/3.3.1/jquery.js`,
        jqueryui: `${cdnUrl}/jqueryui/1.12.1/jquery-ui.js`,
        angular: `${cdnUrl}/angular.js/1.6.5/angular.js`,
        bootstrap: `${cdnUrl}/twitter-bootstrap/4.0.0/js/bootstrap.js`,
        fontawesome: `${cdnUrl}/font-awesome/4.7.0/css/font-awesome.css`,
        moment: `${cdnUrl}/moment.js/2.20.1/moment.js`,
        lodash: `${cdnUrl}/lodash.js/4.17.5/lodash.js`,
        vue: `${cdnUrl}/vue/2.5.13/vue.js`,
        backbone: `${cdnUrl}/backbone.js/1.3.3/backbone.js`,
        cycle: `${cdnUrl}/cyclejs-core/7.0.0/cycle.js`,
        d3: `${cdnUrl}/d3/4.13.0/d3.js`,
        normalize: `${cdnUrl}/normalize/8.0.0/normalize.css`,
        underscore: `${cdnUrl}/underscore.js/1.8.3/underscore.js`,
        foundation: `${cdnUrl}/foundation/6.4.3/js/foundation.js`,
        require: `${cdnUrl}/require.js/2.3.5/require.js`,
        rxjs: `${cdnUrl}/rxjs/5.5.6/Rx.js`,
        bluebird: `${cdnUrl}/bluebird/3.5.1/bluebird.js`,
      }

      libs = _
      .chain(libs)
      .clone()
      .reduce((memo, url, lib) => {
        memo[lib] = url
        memo[`${lib}Min`] = url
        .replace(/js$/, 'min.js')
        .replace(/css$/, 'min.css')

        if (needsDash.includes(lib)) {
          memo[`${lib}Min`] = url.replace('min', '-min')
        }

        return memo
      }
      , {})
      .extend({
        knockoutDebug: `${cdnUrl}/knockout/3.4.2/knockout-debug.js`,
        knockoutMin: `${cdnUrl}/knockout/3.4.2/knockout-min.js`,
        emberMin: `${cdnUrl}/ember.js/2.18.2/ember.min.js`,
        emberProd: `${cdnUrl}/ember.js/2.18.2/ember.prod.js`,
        reactDev: `${cdnUrl}/react/16.2.0/umd/react.development.js`,
        reactProd: `${cdnUrl}/react/16.2.0/umd/react.production.min.js`,
        vendorBundle: 'https://s3.amazonaws.com/internal-test-runner-assets.cypress.io/vendor.bundle.js',
        hugeApp: 'https://s3.amazonaws.com/internal-test-runner-assets.cypress.io/huge_app.js',
      })
      .value()

      return _.each(libs, (url, lib) => {
        it(`does not corrupt code from '${lib}'`, function (done) {
          nock.enableNetConnect()

          this.timeout(10000)

          const pathToLib = Fixtures.path(`server/libs/${lib}`)

          const downloadFile = () => {
            return rp(url)
            .then((resp) => {
              return fs
              .outputFileAsync(pathToLib, resp)
              .return(resp)
            })
          }

          fs
          .readFileAsync(pathToLib, 'utf8')
          .catch(downloadFile)
          .then((libCode) => {
            let stripped = security.strip(libCode)

            expect(() => eval(stripped), 'is valid JS').to.not.throw

            // ensure stripStream matches strip
            const rs = fs.createReadStream(pathToLib, 'utf8')

            rs.pipe(security.stripStream()).pipe(concat((body) => {
              expect(body.toString()).to.eq(stripped)
              done()
            }))
          })
        })
      })
    })
  })
})