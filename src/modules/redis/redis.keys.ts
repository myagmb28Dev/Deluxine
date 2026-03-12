export class RedisKeys {
  static sessionCurrentPose(sessionId: string): string {
    return `session:${sessionId}:current_pose`;
  }

  static poseProgress(sessionId: string): string {
    return `pose:${sessionId}:progress`;
  }

  static renderJobStatus(jobId: string): string {
    return `render_job:${jobId}:status`;
  }

  static tempPoseKeypoints(sessionId: string): string {
    return `temp:pose:${sessionId}:keypoints`;
  }

  static rateLimitSession(sessionId: string, endpoint: string): string {
    return `ratelimit:session:${sessionId}:${endpoint}`;
  }

  static sessionCache(sessionId: string): string {
    return `cache:session:${sessionId}`;
  }

  static poseCache(sessionId: string): string {
    return `cache:pose:${sessionId}`;
  }

  static authRevokePending(userId: string): string {
    return `auth:revoke:pending:${userId}`;
  }
}
