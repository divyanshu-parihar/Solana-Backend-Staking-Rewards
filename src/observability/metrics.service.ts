import { Injectable } from '@nestjs/common';
import { Counter, Histogram, Gauge, register } from 'prom-client';

@Injectable()
export class MetricsService {
  // HTTP metrics
  private httpRequestsTotal: Counter;
  private httpRequestDuration: Histogram;

  // Business metrics
  private stakingOperationsTotal: Counter;
  private rewardClaimsTotal: Counter;
  private activePositionsGauge: Gauge;
  private totalStakedGauge: Gauge;

  // System metrics
  private rpcCallsTotal: Counter;
  private rpcCallDuration: Histogram;
  private databaseQueryDuration: Histogram;

  constructor() {
    // Initialize HTTP metrics
    this.httpRequestsTotal = new Counter({
      name: 'http_requests_total',
      help: 'Total number of HTTP requests',
      labelNames: ['method', 'route', 'status_code'],
    });

    this.httpRequestDuration = new Histogram({
      name: 'http_request_duration_seconds',
      help: 'Duration of HTTP requests in seconds',
      labelNames: ['method', 'route', 'status_code'],
      buckets: [0.01, 0.05, 0.1, 0.3, 0.5, 1, 2, 5],
    });

    // Initialize business metrics
    this.stakingOperationsTotal = new Counter({
      name: 'staking_operations_total',
      help: 'Total number of staking operations',
      labelNames: ['operation', 'status'],
    });

    this.rewardClaimsTotal = new Counter({
      name: 'reward_claims_total',
      help: 'Total number of reward claims',
      labelNames: ['status'],
    });

    this.activePositionsGauge = new Gauge({
      name: 'active_positions',
      help: 'Number of active staking positions',
    });

    this.totalStakedGauge = new Gauge({
      name: 'total_staked_tokens',
      help: 'Total amount of tokens staked',
    });

    // Initialize system metrics
    this.rpcCallsTotal = new Counter({
      name: 'rpc_calls_total',
      help: 'Total number of RPC calls to Solana',
      labelNames: ['method', 'status'],
    });

    this.rpcCallDuration = new Histogram({
      name: 'rpc_call_duration_seconds',
      help: 'Duration of RPC calls in seconds',
      labelNames: ['method'],
      buckets: [0.1, 0.5, 1, 2, 5, 10],
    });

    this.databaseQueryDuration = new Histogram({
      name: 'database_query_duration_seconds',
      help: 'Duration of database queries in seconds',
      labelNames: ['operation'],
      buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1],
    });
  }

  // HTTP metrics
  recordHttpRequest(method: string, route: string, statusCode: number, duration: number) {
    this.httpRequestsTotal.labels(method, route, statusCode.toString()).inc();
    this.httpRequestDuration.labels(method, route, statusCode.toString()).observe(duration);
  }

  // Business metrics
  recordStakingOperation(
    operation: 'stake' | 'unstake' | 'finalize',
    status: 'success' | 'failure',
  ) {
    this.stakingOperationsTotal.labels(operation, status).inc();
  }

  recordRewardClaim(status: 'success' | 'failure') {
    this.rewardClaimsTotal.labels(status).inc();
  }

  updateActivePositions(count: number) {
    this.activePositionsGauge.set(count);
  }

  updateTotalStaked(amount: number) {
    this.totalStakedGauge.set(amount);
  }

  // System metrics
  recordRpcCall(method: string, status: 'success' | 'failure', duration: number) {
    this.rpcCallsTotal.labels(method, status).inc();
    this.rpcCallDuration.labels(method).observe(duration);
  }

  recordDatabaseQuery(operation: string, duration: number) {
    this.databaseQueryDuration.labels(operation).observe(duration);
  }

  // Get all metrics in Prometheus format
  async getMetrics(): Promise<string> {
    return register.metrics();
  }

  // Get content type for metrics endpoint
  getContentType(): string {
    return register.contentType;
  }
}
