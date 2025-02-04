import {
  Controller,
  Post,
  Body,
  HttpException,
  HttpStatus,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { TwitterVideoUploaderService } from './twitter-video-uploader.service';
import * as path from 'path';
import * as fs from 'fs';

// Add type definition
interface MulterFile {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  buffer: Buffer;
  size: number;
}

@Controller('twitter')
export class TwitterVideoUploaderController {
  constructor(private readonly twitterService: TwitterVideoUploaderService) {}

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  async uploadToTwitter(
    @Body('videoUrl') videoUrl?: string,
    @Body('tweetText') tweetText?: string,
    @Body('replyToTweetId') replyToTweetId?: string,
    @UploadedFile() file?: MulterFile,
  ): Promise<any> {
    // Validate input - either videoUrl or file must be provided
    if (!videoUrl && !file) {
      throw new HttpException(
        'Either video URL or file must be provided', 
        HttpStatus.BAD_REQUEST
      );
    }

    try {
      let uploadPath: string | undefined;

      // If a file is uploaded, save it temporarily
      if (file) {
        // Validate file type
        const allowedMimeTypes = [
          'video/mp4', 
          'video/quicktime', 
          'image/jpeg', 
          'image/png', 
          'image/gif'
        ];

        if (!allowedMimeTypes.includes(file.mimetype)) {
          throw new HttpException(
            'Unsupported file type. Only MP4, QuickTime videos, JPEG, PNG, and GIF are allowed', 
            HttpStatus.BAD_REQUEST
          );
        }

        const uploadsDir = path.join(process.cwd(), 'uploads');
        await fs.promises.mkdir(uploadsDir, { recursive: true });

        uploadPath = path.join(
          uploadsDir, 
          `${Date.now()}-${file.originalname}`
        );

        await fs.promises.writeFile(uploadPath, file.buffer);
      }

      // Use either the uploaded file path or the video URL
      const result = await this.twitterService.uploadToTwitter(
        uploadPath || videoUrl!,
        {
          tweetText,
          replyToTweetId,
          mimeType: file ? file.mimetype : undefined
        }
      );

      // Clean up temporary file if it exists
      if (uploadPath) {
        await fs.promises.unlink(uploadPath);
      }

      return result;
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : 'Failed to upload to Twitter';

      throw new HttpException(errorMessage, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}
