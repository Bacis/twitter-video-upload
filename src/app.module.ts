import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import twitterConfig from './config/twitter.config';
import { TwitterVideoUploaderModule } from './twitter/twitter-video-uploader.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [twitterConfig],
    }),
    TwitterVideoUploaderModule,
  ],
})
export class AppModule {}