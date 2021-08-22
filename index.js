require('dotenv').config()
const inquirer = require('inquirer')
const { Telegraf } = require('telegraf')
const bot = new Telegraf(process.env.BOT_TOKEN)

const Config = {
  group_id: '-1001378189116',
  group_username: '@mechistanbul',
  group_lock: false,
  bot_username: 'boba_the_mechanic_bot',
  max_message_length: 40
}

const Errors = {
  SameMessage:
    'Bad Request: message is not modified: specified new message content and reply markup are exactly the same as a current content and reply markup of the message'
}

const Messages = {
  NoOtherGroup: `Bu bot sadece ${Config.group_username} tarafından kullanılabilir.`,
  SameMessage: 'Abi aynı mesajı attın, eklemedim bir daha, haberin olsun.',
  ErrorWhileEditing: `Abi ekleyemedim seni ya, kusura bakma.`,
  TooLong: `Çok uzun bu mesaj, ne olur ${Config.max_message_length} karakterden kısa olsun :(`
}

const Hashtags = {
  '#interestcheck': (id) =>
    `INTEREST CHECK #IC${id} \n` +
    `Bu mesajı alıntılamak bu mesajla ilgilendiğinizi gösterir. ` +
    `Mesaj olarak yazdığınız içerik, not olarak eklenecektir. ` +
    `Mesajınızı güncellemek için tekrar alıntılayın. ` +
    `Silmek için alıntıladığınız mesaja "sil" yazmanız yeterli. `,
  '#groupbuy': (id) =>
    `GROUP BUY #GB${id} \n` +
    `Bu mesajı alıntılamak bu group buy'a katılmak istediğinizi gösterir. ` +
    `Mesaj olarak yazdığınız içerik, sipariş notu olarak eklenecektir. ` +
    `Sipariş notunuzu güncellemek için tekrar alıntılayın. ` +
    `Silmek için alıntıladığınız mesaja "sil" yazmanız yeterli. `
}

String.prototype.replaceAll = function (search, replacement) {
  var target = this
  return target.split(search).join(replacement)
}

String.prototype.indexOfUserLink = function (id) {
  return this.indexOf('(tg://user?id=' + id + ')')
}

const replyWith = (ctx, id, message) =>
  ctx.replyWithMarkdown(message, { reply_to_message_id: id })

const constructUserLink = (name, id) => `[${name}](tg://user?id=${id})`

const constructUserLinkFromMessage = ({
  first_name = '',
  last_name = '',
  username,
  id
}) => {
  return (
    constructUserLink(`${first_name} ${last_name}`.trim(), id) +
    ` (${username ? '@' + username : '?'})`
  )
}

const editErrorHandler = (err, ctx) => {
  if (err.description === Errors.SameMessage) {
    return replyWith(ctx, id, Messages.SameMessage)
  }
  return replyWith(ctx, id, Messages.ErrorWhileEditing)
}

const findLine = (str, offset) => {
  var first = str.substring(0, offset).lastIndexOf('\n')
  var length = str.substring(first + 1).indexOf('\n')

  if (length == -1) {
    length = str.length - first
  }

  return [first + 1, first + length + 1]
}

const editBotMessageLine = (botMessage, quote, from, message = '') => {
  if (quote === -1) return `${botMessage}\n${from}: ${message}`

  let [first, last] = findLine(botMessage, quote)

  if (message.toLowerCase() === 'sil') {
    return (
      botMessage.slice(0, first).trim() +
      botMessage.slice(last, botMessage.length).trim()
    )
  } else {
    return (
      botMessage.slice(0, first) +
      `${from}: ${message}` +
      botMessage.slice(last, botMessage.length)
    )
  }
}

const reLinkUsers = (botMessage, textMentions) => {
  for (let i = textMentions.length - 1; i >= 0; i--) {
    const { offset, length, user } = textMentions[i]
    botMessage =
      botMessage.slice(0, offset) +
      constructUserLink(botMessage.slice(offset, offset + length), user.id) +
      botMessage.slice(offset + length, botMessage.length)
  }
  return botMessage
}

bot.hears(
  () => true, // always listen
  (ctx) => {
    if (Config.group_lock && ctx.message.chat.id != Config.group_id)
      return replyWith(ctx, ctx.message.message_id, Messages.NoOtherGroup)

    // no line breaks allowed in user messages
    const message = ctx.message.text.replaceAll('\n', ' ').trim()
    const id = ctx.message.message_id
    const from = constructUserLinkFromMessage(ctx.message.from)
    const reply = ctx.message.reply_to_message

    // if the message contains a hashtag, handle it
    let tag = Object.keys(Hashtags).find((key) => message.indexOf(key) !== -1)
    if (tag) return replyWith(ctx, id, Hashtags[tag](id))

    if (reply && reply.from.username === Config.bot_username) {
      // if no entities (like #IC86 or #GB513) present, must be an bot error message. Do not reply.
      if (!reply.entities) return

      // user messages must be under 40 characters
      if (message.length > Config.max_message_length)
        return replyWith(ctx, id, Messages.TooLong)

      // bot links users again (telegraf does not provide get markdown style messages)
      let botMessage = reLinkUsers(
        reply.text,
        reply.entities.filter((entity) => entity.type === 'text_mention')
      )

      // edit the original message
      bot.telegram
        .editMessageText(
          ctx.message.chat.id,
          reply.message_id,
          undefined,
          editBotMessageLine(
            botMessage,
            botMessage.indexOfUserLink(ctx.message.from.id),
            from,
            message
          ),
          { parse_mode: 'Markdown' }
        )
        .catch((err) => editErrorHandler(err, ctx))
    }
  }
)

bot.launch().then(() => {
  console.log('Bot ready!')

  const waitForPromptMessage = () => {
    inquirer
      .prompt([
        {
          type: 'input',
          name: 'message',
          message: `Send message to ${Config.group_username}`
        }
      ])
      .then(({ message }) => {
        if (message)
          bot.telegram.sendMessage(Config.group_id, message, {
            parse_mode: 'Markdown'
          })
        waitForPromptMessage()
      })
  }
  waitForPromptMessage()
})
