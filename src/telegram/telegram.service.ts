import { conversations, createConversation } from '@grammyjs/conversations';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Bot, session } from 'grammy';
import { RejectWithReasonConversation } from './conversations/reject-with-reason.conversation';
import { ReplyMessageConversation } from './conversations/reply-message.conversation';
import { RequestEditConversation } from './conversations/request-edit.conversation';
import { SendGroupMessageConversation } from './conversations/send-group-message.conversation';
import { SendMessageConversation } from './conversations/send-message.conversation';
import { TelegramAuthService } from './services/telegram-auth.service';
import { TelegramContentService } from './services/telegram-content.service';
import { TelegramMenuService } from './services/telegram-menu.service';
import { TelegramModerationService } from './services/telegram-moderation.service';
import { ConversationData, MyContext, SessionData } from './types';

@Injectable()
export class TelegramService implements OnModuleInit {
  private readonly logger = new Logger(TelegramService.name);
  private bot: Bot<MyContext>;
  private adminUsername: string;
  private groupChatId: bigint | null;
  private groupChatLink: string | null;
  private maxMessagesPerDay: number;
  private moderationEnabled: boolean;
  private botUsername: string = '';

  // Store conversation data by chatId (workaround for grammyjs/conversations session issue)
  private conversationData = new Map<number, ConversationData>();

  constructor(
    private configService: ConfigService,
    private authService: TelegramAuthService,
    private menuService: TelegramMenuService,
    private contentService: TelegramContentService,
    private moderationService: TelegramModerationService,
    private sendMessageConversation: SendMessageConversation,
    private sendGroupMessageConversation: SendGroupMessageConversation,
    private replyMessageConversation: ReplyMessageConversation,
    private rejectWithReasonConversation: RejectWithReasonConversation,
    private requestEditConversation: RequestEditConversation,
  ) {
    const token = this.configService.get<string>('telegram.botToken');
    if (!token) {
      throw new Error('TELEGRAM_BOT_TOKEN is not defined');
    }

    this.bot = new Bot<MyContext>(token);
    this.adminUsername =
      this.configService.get<string>('telegram.adminUsername') ||
      'nur_ksydykov';
    this.groupChatId =
      this.configService.get<bigint>('telegram.groupChatId') || null;
    this.groupChatLink =
      this.configService.get<string>('telegram.groupChatLink') || null;
    this.maxMessagesPerDay =
      this.configService.get<number>('rateLimit.maxMessagesPerDay') || 100;
    this.moderationEnabled =
      this.configService.get<boolean>('moderation.enabled') ?? true;
  }

  async onModuleInit() {
    const me = await this.bot.api.getMe();
    this.botUsername = me.username || '';
    this.logger.log(`Bot started as @${this.botUsername}`);

    // Configure services
    this.configureServices();

    // Setup middleware
    this.setupMiddleware();

    // Setup handlers
    this.setupHandlers();

    // Start bot
    this.bot.catch((err) => {
      this.logger.error('Bot error:');
      this.logger.error(err);
    });

    this.bot.start();
  }

  private configureServices() {
    // Configure content service
    this.contentService.setBot(this.bot);
    this.contentService.setAdminUsername(this.adminUsername);
    this.contentService.setGroupChatId(this.groupChatId);
    this.contentService.setBotUsername(this.botUsername);

    // Configure auth service
    this.authService.setAdminUsername(this.adminUsername);
    this.authService.setBot(this.bot);
    this.authService.setGroupChatId(this.groupChatId);
    this.authService.setGroupChatLink(this.groupChatLink);

    // Configure menu service
    this.menuService.setMaxMessagesPerDay(this.maxMessagesPerDay);

    // Configure moderation service
    this.moderationService.setBot(this.bot);
    this.moderationService.setGroupChatId(this.groupChatId);
    this.moderationService.setBotUsername(this.botUsername);

    // Configure conversations
    const conversationDataGetter = (chatId: number) =>
      this.conversationData.get(chatId);

    this.sendMessageConversation.setMaxMessagesPerDay(this.maxMessagesPerDay);
    this.sendMessageConversation.setBotUsername(this.botUsername);

    this.sendGroupMessageConversation.setMaxMessagesPerDay(
      this.maxMessagesPerDay,
    );
    this.sendGroupMessageConversation.setModerationEnabled(
      this.moderationEnabled,
    );

    this.replyMessageConversation.setMaxMessagesPerDay(this.maxMessagesPerDay);
    this.replyMessageConversation.setModerationEnabled(this.moderationEnabled);
    this.replyMessageConversation.setConversationDataGetter(
      conversationDataGetter,
    );

    this.rejectWithReasonConversation.setBot(this.bot);
    this.rejectWithReasonConversation.setConversationDataGetter(
      conversationDataGetter,
    );

    this.requestEditConversation.setBot(this.bot);
    this.requestEditConversation.setConversationDataGetter(
      conversationDataGetter,
    );
  }

  private setupMiddleware() {
    this.bot.use(
      session({
        initial: (): SessionData => ({}),
      }),
    );

    this.bot.use(conversations());

    // Register conversations
    this.bot.use(
      createConversation(
        this.sendMessageConversation.run.bind(this.sendMessageConversation),
        'send-message',
      ),
    );
    this.bot.use(
      createConversation(
        this.sendGroupMessageConversation.run.bind(
          this.sendGroupMessageConversation,
        ),
        'send-group-message',
      ),
    );
    this.bot.use(
      createConversation(
        this.replyMessageConversation.run.bind(this.replyMessageConversation),
        'reply-message',
      ),
    );
    this.bot.use(
      createConversation(
        this.rejectWithReasonConversation.run.bind(
          this.rejectWithReasonConversation,
        ),
        'reject-with-reason',
      ),
    );
    this.bot.use(
      createConversation(
        this.requestEditConversation.run.bind(this.requestEditConversation),
        'request-edit',
      ),
    );
  }

  private setupHandlers() {
    // Auto-delete "joined the group" service messages
    this.bot.on('message:new_chat_members', async (ctx) => {
      try {
        await ctx.deleteMessage();
      } catch (error) {
        this.logger.warn('Failed to delete join message:', error);
      }
    });

    // Auto-delete "left the group" service messages
    this.bot.on('message:left_chat_member', async (ctx) => {
      try {
        await ctx.deleteMessage();
      } catch (error) {
        this.logger.warn('Failed to delete leave message:', error);
      }
    });

    // Commands
    this.bot.command('start', async (ctx) => {
      const payload = ctx.match;
      // Handle /start reply_123 from group button
      if (payload && payload.startsWith('reply_')) {
        const messageId = parseInt(payload.replace('reply_', ''));
        if (!isNaN(messageId)) {
          const user = await this.authService.ensureUser(ctx);
          if (user) {
            const chatId = ctx.chat?.id;
            if (chatId) {
              this.conversationData.set(chatId, {
                replyToMessageId: messageId,
              });
            }
            await ctx.conversation.enter('reply-message');
            return;
          }
        }
      }
      // Default start handler
      await this.authService.handleStart(ctx);
    });
    this.bot.command('menu', (ctx) => this.authService.handleMenu(ctx));
    this.bot.command('admin', (ctx) =>
      this.moderationService.handleAdminCommand(
        ctx,
        this.authService.ensureUser.bind(this.authService),
      ),
    );
    this.bot.command('chatid', (ctx) =>
      this.moderationService.handleChatId(ctx),
    );

    // Text buttons from persistent keyboard
    this.bot.hears('✉️ Личное сообщение', async (ctx) => {
      await ctx.conversation.enter('send-message');
    });

    this.bot.hears('📢 В группу', async (ctx) => {
      await ctx.conversation.enter('send-group-message');
    });

    this.bot.hears('📬 Меню', async (ctx) => {
      await this.menuService.showMainMenu(ctx);
    });

    // Callback queries - menu actions
    this.bot.callbackQuery('send_message', async (ctx) => {
      await ctx.answerCallbackQuery();
      await ctx.conversation.enter('send-message');
    });

    this.bot.callbackQuery('send_group_message', async (ctx) => {
      await ctx.answerCallbackQuery();
      await ctx.conversation.enter('send-group-message');
    });

    // Callback queries - reply
    this.bot.callbackQuery(/^reply_(\d+)$/, async (ctx) => {
      await ctx.answerCallbackQuery();
      const messageId = parseInt(ctx.match[1]);
      const chatId = ctx.chat?.id;
      if (chatId) {
        this.conversationData.set(chatId, { replyToMessageId: messageId });
      }
      await ctx.conversation.enter('reply-message');
    });

    // Callback queries - moderation
    this.bot.callbackQuery(/^view_author_(\d+)$/, async (ctx) => {
      await ctx.answerCallbackQuery();
      await this.moderationService.handleViewAuthor(
        ctx,
        parseInt(ctx.match[1]),
        this.authService.ensureUser.bind(this.authService),
      );
    });

    this.bot.callbackQuery(/^approve_(\d+)$/, async (ctx) => {
      await ctx.answerCallbackQuery();
      await this.moderationService.handleApprove(ctx, parseInt(ctx.match[1]));
    });

    this.bot.callbackQuery(/^reject_(\d+)$/, async (ctx) => {
      await ctx.answerCallbackQuery();
      await this.moderationService.handleReject(ctx, parseInt(ctx.match[1]));
    });

    this.bot.callbackQuery(/^reject_reason_(\d+)$/, async (ctx) => {
      await ctx.answerCallbackQuery();
      const messageId = parseInt(ctx.match[1]);
      const chatId = ctx.chat?.id;
      if (chatId) {
        this.conversationData.set(chatId, { moderateMessageId: messageId });
      }
      await ctx.conversation.enter('reject-with-reason');
    });

    this.bot.callbackQuery(/^request_edit_(\d+)$/, async (ctx) => {
      await ctx.answerCallbackQuery();
      const messageId = parseInt(ctx.match[1]);
      const chatId = ctx.chat?.id;
      if (chatId) {
        this.conversationData.set(chatId, { moderateMessageId: messageId });
      }
      await ctx.conversation.enter('request-edit');
    });

    this.bot.callbackQuery('back_to_menu', async (ctx) => {
      await ctx.answerCallbackQuery();
      await this.menuService.showMainMenu(ctx);
    });
  }
}
