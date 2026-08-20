import BaseModel from './BaseModel.js';

class AiUsageLog extends BaseModel {
  static get collection() {
    return 'ai_usage_logs';
  }
}

export default AiUsageLog;