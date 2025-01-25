import { Module } from '@nestjs/common';
import { TwitterVideoUploaderService } from './twitter-video-uploader.service';
import { TwitterVideoUploaderController } from './twitter-video-uploader.controller';

@Module({
  controllers: [TwitterVideoUploaderController],
  providers: [TwitterVideoUploaderService]
})
export class TwitterVideoUploaderModule {}