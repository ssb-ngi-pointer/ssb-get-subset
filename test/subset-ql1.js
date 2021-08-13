const ssbKeys = require('ssb-keys')
const path = require('path')
const test = require('tape')
const pull = require('pull-stream')
const rimraf = require('rimraf')
const mkdirp = require('mkdirp')
const SecretStack = require('secret-stack')
const caps = require('ssb-caps')

const dir = '/tmp/ssb-getsubset-ql1'

rimraf.sync(dir)
mkdirp.sync(dir)

const keys = ssbKeys.loadOrCreateSync(path.join(dir, 'secret'))

const sbot = SecretStack({ appKey: caps.shs })
  .use(require('ssb-db2'))
  .use(require('../'))
  .call(null, {
    keys,
    path: dir,
  })

test('getSubset() QL1 Base', (t) => {
  const msg1 = { type: 'post', text: 'a' }
  const msg2 = { type: 'vote', vote: { value: 1, link: '%abc' } }
  const msg3 = { type: 'post', text: 'c' }

  pull(
    pull.values([msg1, msg2, msg3]),
    pull.asyncMap((msg, cb) => sbot.db.publish(msg, cb)),
    pull.collect((err) => {
      t.error(err)
      sbot.db.onDrain(() => {
        pull(
          sbot.getSubset(
            { op: 'type', string: 'post' }, // "type('post')"
            { querylang: 'ssb-ql-1' }
          ),
          pull.collect((err, results) => {
            t.error(err)
            t.equal(results.length, 2, 'correct number of results')
            t.end()
          })
        )
      })
    })
  )
})

test('getSubset() QL1 Advanced', (t) => {
  pull(
    sbot.getSubset(
      {
        op: 'and',
        args: [
          { op: 'type', string: 'post' },
          { op: 'author', feed: '@abc' },
        ],
      },
      { querylang: 'ssb-ql-1' }
    ),
    pull.collect((err, results) => {
      t.error(err)
      t.equal(results.length, 0, 'correct number of results')

      pull(
        sbot.getSubset(
          {
            op: 'and',
            args: [
              { op: 'type', string: 'post' },
              {
                op: 'or',
                args: [
                  { op: 'author', feed: '@abc' },
                  { op: 'author', feed: sbot.id },
                ],
              },
            ],
          },
          { querylang: 'ssb-ql-1' }
        ),
        pull.collect((err, results) => {
          t.error(err)
          t.equal(results.length, 2, 'correct number of results')

          t.end()
        })
      )
    })
  )
})

test('getSubset() QL1 Opts', (t) => {
  pull(
    sbot.getSubset(
      {
        op: 'and',
        args: [
          { op: 'type', string: 'post' },
          { op: 'author', feed: sbot.id },
        ],
      },
      {
        querylang: 'ssb-ql-1',
        descending: true,
        pageSize: 1,
      }
    ),
    pull.collect((err, results) => {
      t.error(err)
      t.equal(results.length, 1, 'correct number of results')
      t.equal(results[0].content.text, 'c', 'correct msg')

      pull(
        sbot.getSubset(
          {
            op: 'and',
            args: [
              { op: 'type', string: 'post' },
              { op: 'author', feed: sbot.id },
            ],
          },
          {
            querylang: 'ssb-ql-1',
            startFrom: 1,
          }
        ),
        pull.collect((err, results) => {
          t.error(err)
          t.equal(results.length, 1, 'correct number of results')
          t.equal(results[0].content.text, 'c', 'correct msg')

          t.end()
        })
      )
    })
  )
})

test('getSubset() QL1 Error cases', (t) => {
  t.throws(() => {
    pull(
      sbot.getSubset(
        {
          op: 'andz',
          args: [
            { op: 'type', string: 'post' },
            { op: 'author', feed: sbot.id },
          ],
        },
        {
          querylang: 'ssb-ql-1',
          descending: true,
          pageSize: 1,
        }
      ),
      pull.collect((err, results) => {})
    )
  }, 'unknown op andz')

  t.throws(() => {
    pull(
      sbot.getSubset(
        {
          op: 'author',
        },
        { querylang: 'ssb-ql-1' }
      ),
      pull.collect((err, results) => {
        console.log(err)

        sbot(t.end)
      })
    )
  }, 'missing data')

  sbot.close(t.end)
})
