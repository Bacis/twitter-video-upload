import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import * as OAuth from 'oauth-1.0a';
import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';

// Add a type definition if needed
interface OAuthConfig {
  consumer: { key: string; secret: string };
  signature_method: string;
  hash_function: (base_string: string, key: string) => string;
}

@Injectable()
export class TwitterVideoUploaderService {
  private readonly logger = new Logger(TwitterVideoUploaderService.name);
  private oauth: OAuth;

  constructor(private configService: ConfigService) {
    const consumerKey = this.validateCredential('twitter.consumerKey');
    const consumerSecret = this.validateCredential('twitter.consumerSecret');

    this.oauth = new OAuth({
      consumer: { key: consumerKey, secret: consumerSecret },
      signature_method: 'HMAC-SHA1',
      hash_function: (base_string: string, key: string) => {
        return crypto.createHmac('sha1', key)
          .update(base_string)
          .digest('base64');
      },
    });
  }

  private validateCredential(credentialPath: string): string {
    const credential = this.configService.get<string>(credentialPath);
    if (!credential) {
      throw new Error(`Missing credential: ${credentialPath}`);
    }
    return credential;
  }

  async uploadVideoToTwitter(
    videoUrl: string,
    tweetText: string = 'Check out my new video! 🎥 #VideoUpload',
    replyToTweetId?: string,
  ): Promise<{ id: string }> {
    try {
      // Download video from remote URL
      const localFilePath = await this.downloadVideoFromUrl(videoUrl);

      // Upload video
      const uploadResponse = await this.uploadVideo(localFilePath);
      const mediaId = uploadResponse.media_id_string;

      // Wait for video processing
      await this.waitForMediaProcessing(mediaId);

      // Create tweet
      const tweetResponse = await this.createTweet(mediaId, tweetText, replyToTweetId);

      // Clean up local file
      await fs.promises.unlink(localFilePath);

      return tweetResponse;
    } catch (error) {
      this.logger.error('Video upload or tweet process failed', error);
      throw error;
    }
  }

  async uploadVideo(filePath: string): Promise<any> {
    try {
      // Validate file exists
      if (!fs.existsSync(filePath)) {
        throw new Error(`File not found: ${filePath}`);
      }

      const fileData = fs.readFileSync(filePath);
      const fileSize = fs.statSync(filePath).size;

      this.logger.log(`Uploading video: ${path.basename(filePath)}, Size: ${fileSize} bytes`);

      // Step 1: Initialize upload
      const initUrl = 'https://upload.twitter.com/1.1/media/upload.json';
      const initData = {
        command: 'INIT',
        total_bytes: fileSize,
        media_type: 'video/mp4',
      };

      const accessToken = this.validateCredential('twitter.accessToken');
      const accessTokenSecret = this.validateCredential('twitter.accessTokenSecret');

      const initAuthHeader = this.oauth.toHeader(
        this.oauth.authorize(
          { url: initUrl, method: 'POST', data: initData },
          { key: accessToken, secret: accessTokenSecret }
        )
      );

      this.logger.log('Step 1: Initializing upload...');
      const initResponse = await axios.post(initUrl, initData, {
        headers: {
          ...initAuthHeader,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      });

      const mediaId = initResponse.data.media_id_string;
      this.logger.log(`Media ID: ${mediaId}`);

      // Step 2: Append video chunks
      this.logger.log('Step 2: Uploading video chunks...');
      const chunkSize = 5 * 1024 * 1024; // 5MB chunks
      let segmentIndex = 0;

      for (let i = 0; i < fileSize; i += chunkSize) {
        const chunk = fileData.slice(i, i + chunkSize);
        const appendData = {
          command: 'APPEND',
          media_id: mediaId,
          segment_index: segmentIndex,
          media: chunk.toString('base64'),
        };

        const appendAuthHeader = this.oauth.toHeader(
          this.oauth.authorize(
            { url: initUrl, method: 'POST', data: appendData },
            { key: accessToken, secret: accessTokenSecret }
          )
        );

        this.logger.log(`Uploading segment ${segmentIndex}`);
        await axios.post(initUrl, appendData, {
          headers: {
            ...appendAuthHeader,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        });
        segmentIndex++;
      }

      // Step 3: Finalize upload
      this.logger.log('Step 3: Finalizing upload...');
      const finalizeData = {
        command: 'FINALIZE',
        media_id: mediaId,
      };

      const finalizeAuthHeader = this.oauth.toHeader(
        this.oauth.authorize(
          { url: initUrl, method: 'POST', data: finalizeData },
          { key: accessToken, secret: accessTokenSecret }
        )
      );

      const finalizeResponse = await axios.post(initUrl, finalizeData, {
        headers: {
          ...finalizeAuthHeader,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      });

      this.logger.log('Video upload completed successfully');
      return finalizeResponse.data;
    } catch (error) {
      this.logger.error('Video upload failed', error);
      throw error;
    }
  }

  async waitForMediaProcessing(mediaId: string): Promise<void> {
    const MAX_ATTEMPTS = 10;
    const MAX_PROCESSING_TIME = 5 * 60 * 1000; // 5 minutes
    const startTime = Date.now();
    let attempts = 0;

    while (attempts < MAX_ATTEMPTS) {
      const mediaStatus = await this.checkMediaStatus(mediaId);
      this.logger.log('Media Processing Status:', mediaStatus);

      if (mediaStatus.processing_info?.state === 'succeeded') {
        return;
      }

      if (Date.now() - startTime > MAX_PROCESSING_TIME) {
        throw new Error('Media processing exceeded maximum time limit');
      }

      const waitTime = Math.min(
        mediaStatus.processing_info?.check_after_secs || 2,
        30
      );

      this.logger.log(
        `Waiting ${waitTime} seconds for video processing (Attempt ${
          attempts + 1
        }/${MAX_ATTEMPTS})...`
      );
      await new Promise((resolve) => setTimeout(resolve, waitTime * 1000));

      attempts++;
    }

    throw new Error('Media processing failed after maximum attempts');
  }

  async checkMediaStatus(mediaId: string): Promise<any> {
    const mediaStatusUrl = 'https://upload.twitter.com/1.1/media/upload.json';

    const requestData = {
      command: 'STATUS',
      media_id: mediaId,
    };

    const accessToken = this.validateCredential('twitter.accessToken');
    const accessTokenSecret = this.validateCredential('twitter.accessTokenSecret');

    const authHeader = this.oauth.toHeader(
      this.oauth.authorize(
        { url: mediaStatusUrl, method: 'GET', data: requestData },
        { key: accessToken, secret: accessTokenSecret }
      )
    );

    try {
      const response = await axios.get(mediaStatusUrl, {
        params: requestData,
        headers: {
          ...authHeader,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      });

      return response.data;
    } catch (error) {
      this.logger.error('Error checking media status', error);
      throw error;
    }
  }

  async createTweet(
    mediaId: string,
    text: string = 'Uploaded a new video!',
    replyToTweetId?: string,
  ): Promise<any> {
    const tweetUrl = 'https://api.twitter.com/2/tweets';

    const accessToken = this.validateCredential('twitter.accessToken');
    const accessTokenSecret = this.validateCredential('twitter.accessTokenSecret');

    const requestData = {
      url: tweetUrl,
      method: 'POST',
    };

    const authHeader = this.oauth.toHeader(
      this.oauth.authorize(requestData, {
        key: accessToken,
        secret: accessTokenSecret,
      })
    );

    try {
      const tweetPayload: any = {
        text: text,
        media: {
          media_ids: [mediaId],
        },
      };

      // Add reply only if replyToTweetId is provided
      if (replyToTweetId) {
        tweetPayload.reply = {
          in_reply_to_tweet_id: replyToTweetId,
        };
      }

      const response = await axios.post(
        tweetUrl,
        tweetPayload,
        {
          headers: {
            ...authHeader,
            'Content-Type': 'application/json',
          },
        }
      );

      this.logger.log('Tweet created successfully');
      return response.data;
    } catch (error) {
      this.logger.error('Detailed Tweet Error', error);
      throw error;
    }
  }

  private async downloadVideoFromUrl(videoUrl: string): Promise<string> {
    try {
      // Create uploads directory if it doesn't exist
      const uploadsDir = path.join(process.cwd(), 'uploads');
      await fs.promises.mkdir(uploadsDir, { recursive: true });

      // Generate unique filename
      const fileName = `video-${Date.now()}.mp4`;
      const localFilePath = path.join(uploadsDir, fileName);

      // Download video
      const response = await axios<NodeJS.ReadableStream>({
        method: 'get',
        url: videoUrl,
        responseType: 'stream',
      });

      // Strict type check for stream
      if (!response.data || typeof response.data.pipe !== 'function') {
        throw new Error('Invalid response stream');
      }

      // Save video to local file
      const writer = fs.createWriteStream(localFilePath);
      response.data.pipe(writer);

      return new Promise((resolve, reject) => {
        writer.on('finish', () => resolve(localFilePath));
        writer.on('error', reject);
      });
    } catch (error) {
      this.logger.error('Failed to download video', error);
      throw new Error(
        `Video download failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }
}
