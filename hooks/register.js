// commit-nag: a band above the prompt that keeps you honest about uncommitted work.

let state = null // { branch, files, lastCommitAt } or null outside a git repo

async function git($, args) {
  try {
    const result = await $.process.run(['git', ...args])
    return result.exitCode === 0 ? result.stdout.trim() : null
  } catch {
    return null
  }
}

async function refresh($) {
  const branch = await git($, ['rev-parse', '--abbrev-ref', 'HEAD'])
  if (branch === null) {
    state = null
    return
  }
  const status = (await git($, ['status', '--porcelain'])) ?? ''
  const lastCommit = await git($, ['log', '-1', '--format=%ct'])
  state = {
    branch,
    files: status ? status.split('\n').length : 0,
    lastCommitAt: lastCommit ? Number(lastCommit) * 1000 : null,
  }
}

function age(ms) {
  const minutes = Math.floor(ms / 60_000)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  return `${Math.floor(hours / 24)}d`
}

function roast(files, days) {
  if (files === 0) return { text: 'clean tree. respect.', color: 'green' }
  if (files >= 100) return { text: `${files} files. this isn't a branch, it's a lifestyle. commit something.`, color: 'red' }
  if (days >= 3) return { text: `${days} days without a commit. your future self is filing a complaint.`, color: 'red' }
  if (files >= 20) return { text: 'that\'s a lot of vibes and not a lot of commits.', color: 'yellow' }
  return null
}

export function register(on) {
  on('session.start', async ($, e, next) => {
    await refresh($)
    $.clock.every(10_000, async () => {
      await refresh($)
      $.ui.invalidate('ui.render')
    })
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const theirs = await next(e)
    if (!state) return theirs

    const { Box, Text } = $.ui.resolve(e)
    const sinceMs = state.lastCommitAt ? Date.now() - state.lastCommitAt : null
    const days = sinceMs === null ? 0 : Math.floor(sinceMs / 86_400_000)
    const line = roast(state.files, days)
    const filesColor = state.files === 0 ? 'green' : state.files >= 20 ? 'red' : 'yellow'

    return Box({
      flexDirection: 'column',
      children: [
        Box({
          flexDirection: 'row',
          gap: 2,
          children: [
            Text({ children: ['⎇ ' + state.branch], color: 'cyan', bold: true }),
            Text({ children: [`${state.files} uncommitted`], color: filesColor, bold: state.files >= 20 }),
            Text({ children: [sinceMs === null ? 'no commits yet' : `last commit ${age(sinceMs)} ago`], color: days >= 3 ? 'red' : 'gray' }),
          ],
        }),
        ...(line ? [Text({ children: [line.text], color: line.color, italic: true })] : []),
        ...(theirs ? [theirs] : []),
      ],
    })
  })
}
