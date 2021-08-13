const ssbKeys = require('ssb-keys')
const path = require('path')
const test = require('tape')
const pull = require('pull-stream')
const rimraf = require('rimraf')
const mkdirp = require('mkdirp')
const SecretStack = require('secret-stack')
const caps = require('ssb-caps')

const dir = '/tmp/ssb-get-index-feed-ql1'

rimraf.sync(dir)
mkdirp.sync(dir)

const keys = ssbKeys.loadOrCreateSync(path.join(dir, 'secret'))

const sbot = SecretStack({ appKey: caps.shs })
  .use(require('ssb-meta-feeds'))
  .use(require('ssb-db2'))
  .use(require('../'))
  .call(null, {
    keys,
    path: dir,
  })

test('resolveIndexFeed() QL1 Base', (t) => {
  const feedid = ssbKeys.generate().id
  const msg1 = { type: 'contact', contact: feedid, following: true }
  const msg2 = { type: 'vote', vote: { value: 1, link: '%abc' } }
  const msg3 = { type: 'post', text: 'c' }

  sbot.metafeeds.findOrCreate((err, mf) => {
    sbot.metafeeds.create(
      mf,
      {
        feedpurpose: 'index',
        feedformat: 'classic',
        metadata: {
          querylang: 'ssb-ql-1',
          query: JSON.stringify({
            op: 'and',
            args: [
              { op: 'type', string: 'contact' },
              { op: 'author', feed: sbot.id },
            ],
          }),
        },
      },
      (err, indexFeed) => {
        sbot.db.publish(msg1, (err, indexMsg) => {
          const indexMsg1 = { type: 'metafeed/index', indexed: indexMsg.key }

          pull(
            pull.values([msg2, msg3]),
            pull.asyncMap((msg, cb) => sbot.db.publish(msg, cb)),
            pull.collect((err) => {
              t.error(err)

              sbot.db.publishAs(indexFeed.keys, indexMsg1, (err) => {
                t.error(err)
                sbot.db.onDrain(() => {
                  pull(
                    sbot.resolveIndexFeed(indexFeed.keys.id),
                    pull.collect((err, results) => {
                      t.error(err)
                      t.equal(results.length, 1, 'correct number of results')
                      t.equal(
                        results[0].msg.content.type,
                        'metafeed/index',
                        'correct index msg'
                      )
                      t.equal(
                        results[0].indexed.content.type,
                        'contact',
                        'correct msg'
                      )
                      t.end()
                    })
                  )
                })
              })
            })
          )
        })
      }
    )
  })
})

test('resolveIndexFeed() QL1 Error cases', (t) => {
  pull(
    sbot.resolveIndexFeed(sbot.id),
    pull.collect((err, results) => {
      t.match(err.message, /Not a proper index feed/, 'err')
      t.equal(results.length, 0, 'zero results')

      pull(
        sbot.resolveIndexFeed(
          '@randoIzFW+BvLV246CW05g6jLkTvLilp7IW+9irQkfU=.ed25519'
        ),
        pull.collect((err, results) => {
          t.match(err.message, /Not a proper index feed/, 'err')
          t.equal(results.length, 0, 'zero results')

          sbot.close(t.end)
        })
      )
    })
  )
})
