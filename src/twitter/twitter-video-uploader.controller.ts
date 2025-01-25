import {
  Controller,
  Post,
  Body,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { TwitterVideoUploaderService } from './twitter-video-uploader.service';

@Controller('twitter')
export class TwitterVideoUploaderController {
  constructor(private readonly twitterService: TwitterVideoUploaderService) {}

  @Post('upload')
  async uploadVideoToTwitter(
    @Body('videoUrl') videoUrl: string,
    @Body('tweetText') tweetText?: string,
  ): Promise<any> {
    // Validate video URL
    if (!videoUrl) {
      throw new HttpException('Video URL is required', HttpStatus.BAD_REQUEST);
    }

    try {
      const result = await this.twitterService.uploadVideoToTwitter(
        videoUrl,
        tweetText,
      );

      return result;
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'An unknown error occurred';

      throw new HttpException(errorMessage, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}
