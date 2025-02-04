import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { TwitterVideoUploaderService } from './twitter-video-uploader.service';
import { TwitterVideoUploaderController } from './twitter-video-uploader.controller';

@Module({
  imports: [
    MulterModule.register({
      limits: {
        fileSize: 50 * 1024 * 1024, // 50MB max file size
      },
    }),
  ],
  controllers: [TwitterVideoUploaderController],
  providers: [TwitterVideoUploaderService]
})
export class TwitterVideoUploaderModule {}