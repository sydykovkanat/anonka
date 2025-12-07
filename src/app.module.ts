import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { TelegramModule } from './telegram/telegram.module';
import { UserModule } from './user/user.module';
import { MessageModule } from './message/message.module';
import { ImportModule } from './import/import.module';
import configuration from './config/configuration';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),
    PrismaModule,
    UserModule,
    MessageModule,
    ImportModule,
    TelegramModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
