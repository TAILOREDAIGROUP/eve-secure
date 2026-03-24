import * as aws from "@pulumi/aws";
import * as awsx from "@pulumi/awsx";
import * as pulumi from "@pulumi/pulumi";

const config = new pulumi.Config();
const awsConfig = new pulumi.Config("aws");
const environment = config.require("environment");
const region = awsConfig.require("region");
const enableMetrics = config.getBoolean("enableMetrics") ?? true;
const enableAlarms = config.getBoolean("enableAlarms") ?? true;
const logRetentionDays = config.getNumber("logRetentionDays") ?? 30;

const stackName = pulumi.getStack();
const projectName = pulumi.getProject();

// Common tags
const commonTags = {
  Project: projectName,
  Stack: stackName,
  Environment: environment,
  ManagedBy: "Pulumi",
};

// ==================== VPC ====================
const vpc = new awsx.ec2.Vpc("eve-secure-vpc", {
  cidrBlock: "10.0.0.0/16",
  enableDnsHostnames: true,
  enableDnsSupport: true,
  tags: { ...commonTags, Name: "eve-secure-vpc" },
});

// ==================== KMS Keys ====================

// Master KMS key for S3 app data encryption
const appDataKey = new aws.kms.Key("app-data-key", {
  description: "KMS key for S3 app data encryption",
  deletionWindowInDays: 30,
  enableKeyRotation: true,
  tags: { ...commonTags, Purpose: "AppDataEncryption" },
});

const appDataKeyAlias = new aws.kms.Alias("app-data-key-alias", {
  name: pulumi.interpolate`alias/${projectName}-app-data-${environment}`,
  targetKeyId: appDataKey.id,
});

// KMS key for audit trail
const auditKey = new aws.kms.Key("audit-trail-key", {
  description: "KMS key for audit trail S3 bucket",
  deletionWindowInDays: 30,
  enableKeyRotation: true,
  tags: { ...commonTags, Purpose: "AuditTrail" },
});

const auditKeyAlias = new aws.kms.Alias("audit-trail-key-alias", {
  name: pulumi.interpolate`alias/${projectName}-audit-${environment}`,
  targetKeyId: auditKey.id,
});

// KMS key for backup encryption
const backupKey = new aws.kms.Key("backup-key", {
  description: "KMS key for backup S3 bucket",
  deletionWindowInDays: 30,
  enableKeyRotation: true,
  tags: { ...commonTags, Purpose: "Backups" },
});

const backupKeyAlias = new aws.kms.Alias("backup-key-alias", {
  name: pulumi.interpolate`alias/${projectName}-backup-${environment}`,
  targetKeyId: backupKey.id,
});

// ==================== S3 Buckets ====================

// App data bucket
const appDataBucket = new aws.s3.BucketV2("app-data-bucket", {
  bucket: pulumi.interpolate`${projectName}-app-data-${environment}-${aws.getCallerIdentity({}).then(id => id.accountId)}`,
  tags: { ...commonTags, Purpose: "AppData" },
});

new aws.s3.BucketVersioningV2("app-data-versioning", {
  bucket: appDataBucket.id,
  versioningConfiguration: {
    status: "Enabled",
  },
});

new aws.s3.BucketServerSideEncryptionConfigurationV2("app-data-sse", {
  bucket: appDataBucket.id,
  rules: [
    {
      applyServerSideEncryptionByDefault: {
        sseAlgorithm: "aws:kms",
        kmsMasterKeyId: appDataKey.arn,
      },
      bucketKeyEnabled: true,
    },
  ],
});

new aws.s3.BucketPublicAccessBlockV2("app-data-block-public", {
  bucket: appDataBucket.id,
  blockPublicAcls: true,
  blockPublicPolicy: true,
  ignorePublicAcls: true,
  restrictPublicBuckets: true,
});

// Audit trail bucket with Object Lock
const auditBucket = new aws.s3.BucketV2("audit-trail-bucket", {
  bucket: pulumi.interpolate`${projectName}-audit-${environment}-${aws.getCallerIdentity({}).then(id => id.accountId)}`,
  objectLockEnabled: true,
  tags: { ...commonTags, Purpose: "AuditTrail" },
});

new aws.s3.BucketObjectLockConfigurationV2("audit-object-lock", {
  bucket: auditBucket.id,
  rule: {
    defaultRetention: {
      mode: "COMPLIANCE",
      days: environment === "production" ? 2555 : 90, // 7 years for prod, 90 days for staging
    },
  },
});

new aws.s3.BucketVersioningV2("audit-versioning", {
  bucket: auditBucket.id,
  versioningConfiguration: {
    status: "Enabled",
  },
});

new aws.s3.BucketServerSideEncryptionConfigurationV2("audit-sse", {
  bucket: auditBucket.id,
  rules: [
    {
      applyServerSideEncryptionByDefault: {
        sseAlgorithm: "aws:kms",
        kmsMasterKeyId: auditKey.arn,
      },
      bucketKeyEnabled: true,
    },
  ],
});

new aws.s3.BucketPublicAccessBlockV2("audit-block-public", {
  bucket: auditBucket.id,
  blockPublicAcls: true,
  blockPublicPolicy: true,
  ignorePublicAcls: true,
  restrictPublicBuckets: true,
});

// Backup bucket with cross-region replication
const backupBucket = new aws.s3.BucketV2("backup-bucket", {
  bucket: pulumi.interpolate`${projectName}-backup-${environment}-${aws.getCallerIdentity({}).then(id => id.accountId)}`,
  tags: { ...commonTags, Purpose: "Backups" },
});

new aws.s3.BucketVersioningV2("backup-versioning", {
  bucket: backupBucket.id,
  versioningConfiguration: {
    status: "Enabled",
  },
});

new aws.s3.BucketServerSideEncryptionConfigurationV2("backup-sse", {
  bucket: backupBucket.id,
  rules: [
    {
      applyServerSideEncryptionByDefault: {
        sseAlgorithm: "aws:kms",
        kmsMasterKeyId: backupKey.arn,
      },
      bucketKeyEnabled: true,
    },
  ],
});

new aws.s3.BucketPublicAccessBlockV2("backup-block-public", {
  bucket: backupBucket.id,
  blockPublicAcls: true,
  blockPublicPolicy: true,
  ignorePublicAcls: true,
  restrictPublicBuckets: true,
});

// ==================== IAM Roles ====================

// ECS Task Execution Role
const ecsTaskExecutionRole = new aws.iam.Role("ecs-task-execution-role", {
  assumeRolePolicy: JSON.stringify({
    Version: "2012-10-17",
    Statement: [
      {
        Action: "sts:AssumeRole",
        Effect: "Allow",
        Principal: {
          Service: "ecs-tasks.amazonaws.com",
        },
      },
    ],
  }),
  tags: { ...commonTags, Purpose: "ECSTaskExecution" },
});

new aws.iam.RolePolicyAttachment("ecs-task-execution-policy", {
  role: ecsTaskExecutionRole.name,
  policyArn: "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy",
});

// ECS Task Role
const ecsTaskRole = new aws.iam.Role("ecs-task-role", {
  assumeRolePolicy: JSON.stringify({
    Version: "2012-10-17",
    Statement: [
      {
        Action: "sts:AssumeRole",
        Effect: "Allow",
        Principal: {
          Service: "ecs-tasks.amazonaws.com",
        },
      },
    ],
  }),
  tags: { ...commonTags, Purpose: "ECSTask" },
});

// S3 access policy for ECS task
new aws.iam.RolePolicy("ecs-s3-policy", {
  role: ecsTaskRole.id,
  policy: pulumi.interpolate`{
    "Version": "2012-10-17",
    "Statement": [
      {
        "Effect": "Allow",
        "Action": [
          "s3:GetObject",
          "s3:PutObject",
          "s3:DeleteObject",
          "s3:ListBucket"
        ],
        "Resource": [
          "${appDataBucket.arn}",
          "${appDataBucket.arn}/*"
        ]
      },
      {
        "Effect": "Allow",
        "Action": [
          "s3:PutObject"
        ],
        "Resource": [
          "${auditBucket.arn}/*"
        ]
      },
      {
        "Effect": "Allow",
        "Action": [
          "kms:Decrypt",
          "kms:GenerateDataKey"
        ],
        "Resource": [
          "${appDataKey.arn}",
          "${auditKey.arn}"
        ]
      }
    ]
  }`,
});

// Secrets Manager access
new aws.iam.RolePolicy("ecs-secrets-policy", {
  role: ecsTaskRole.id,
  policy: JSON.stringify({
    Version: "2012-10-17",
    Statement: [
      {
        Effect: "Allow",
        Action: ["secretsmanager:GetSecretValue"],
        Resource: pulumi.interpolate`arn:aws:secretsmanager:${region}:*:secret:${projectName}/*`,
      },
    ],
  }),
});

// CloudWatch Logs
new aws.iam.RolePolicy("ecs-logs-policy", {
  role: ecsTaskRole.id,
  policy: JSON.stringify({
    Version: "2012-10-17",
    Statement: [
      {
        Effect: "Allow",
        Action: ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"],
        Resource: "arn:aws:logs:*:*:*",
      },
    ],
  }),
});

// Lambda Execution Role
const lambdaExecutionRole = new aws.iam.Role("lambda-execution-role", {
  assumeRolePolicy: JSON.stringify({
    Version: "2012-10-17",
    Statement: [
      {
        Action: "sts:AssumeRole",
        Effect: "Allow",
        Principal: {
          Service: "lambda.amazonaws.com",
        },
      },
    ],
  }),
  tags: { ...commonTags, Purpose: "LambdaExecution" },
});

new aws.iam.RolePolicyAttachment("lambda-vpc-policy", {
  role: lambdaExecutionRole.name,
  policyArn: "arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole",
});

new aws.iam.RolePolicyAttachment("lambda-basic-policy", {
  role: lambdaExecutionRole.name,
  policyArn: "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole",
});

// ==================== Secrets Manager ====================

const dbPasswordSecret = new aws.secretsmanager.Secret("db-password", {
  name: pulumi.interpolate`${projectName}/db-password-${environment}`,
  description: "Database password for EVE Secure",
  tags: commonTags,
});

const jwtSecretKey = new aws.secretsmanager.Secret("jwt-secret", {
  name: pulumi.interpolate`${projectName}/jwt-secret-${environment}`,
  description: "JWT signing secret",
  tags: commonTags,
});

const encryptionKey = new aws.secretsmanager.Secret("encryption-key", {
  name: pulumi.interpolate`${projectName}/encryption-key-${environment}`,
  description: "Application encryption key",
  tags: commonTags,
});

const openaiApiKey = new aws.secretsmanager.Secret("openai-api-key", {
  name: pulumi.interpolate`${projectName}/openai-api-key-${environment}`,
  description: "OpenAI API key",
  tags: commonTags,
});

// ==================== ElastiCache (Redis) ====================

const cacheSubnetGroup = new aws.elasticache.SubnetGroup("cache-subnet-group", {
  subnetIds: vpc.privateSubnetIds,
  tags: commonTags,
});

const cacheSecurityGroup = new aws.ec2.SecurityGroup("cache-security-group", {
  vpcId: vpc.id,
  ingress: [
    {
      protocol: "tcp",
      fromPort: 6379,
      toPort: 6379,
      cidrBlocks: ["10.0.0.0/16"],
    },
  ],
  egress: [
    {
      protocol: "-1",
      fromPort: 0,
      toPort: 0,
      cidrBlocks: ["0.0.0.0/0"],
    },
  ],
  tags: { ...commonTags, Name: "cache-security-group" },
});

const redisCluster = new aws.elasticache.Cluster("redis-cluster", {
  clusterId: pulumi.interpolate`${projectName}-${environment}`,
  engine: "redis",
  engineVersion: "7.0",
  nodeType: environment === "production" ? "cache.r6g.xlarge" : "cache.t3.micro",
  numCacheNodes: environment === "production" ? 3 : 1,
  parameterGroupName: "default.redis7",
  port: 6379,
  subnetGroupName: cacheSubnetGroup.name,
  securityGroupIds: [cacheSecurityGroup.id],
  autoFailover: environment === "production",
  multiAzEnabled: environment === "production",
  atRestEncryptionEnabled: true,
  transitEncryptionEnabled: true,
  transitEncryptionMode: "preferred",
  tags: commonTags,
});

// ==================== CloudWatch Log Groups ====================

const apiLogGroup = new aws.cloudwatch.LogGroup("api-logs", {
  name: pulumi.interpolate`/eve-secure/${environment}/api`,
  retentionInDays: logRetentionDays,
  kmsKeyId: appDataKey.arn,
  tags: commonTags,
});

const auditLogGroup = new aws.cloudwatch.LogGroup("audit-logs", {
  name: pulumi.interpolate`/eve-secure/${environment}/audit`,
  retentionInDays: logRetentionDays,
  kmsKeyId: auditKey.arn,
  tags: commonTags,
});

const lambdaPdfLogGroup = new aws.cloudwatch.LogGroup("lambda-pdf-logs", {
  name: pulumi.interpolate`/aws/lambda/${projectName}-pdf-${environment}`,
  retentionInDays: logRetentionDays,
  kmsKeyId: appDataKey.arn,
  tags: commonTags,
});

const lambdaClamavLogGroup = new aws.cloudwatch.LogGroup("lambda-clamav-logs", {
  name: pulumi.interpolate`/aws/lambda/${projectName}-clamav-${environment}`,
  retentionInDays: logRetentionDays,
  kmsKeyId: appDataKey.arn,
  tags: commonTags,
});

// ==================== ECS Cluster ====================

const cluster = new aws.ecs.Cluster("eve-secure-cluster", {
  name: pulumi.interpolate`${projectName}-${environment}`,
  settings: [
    {
      name: "containerInsights",
      value: enableMetrics ? "enabled" : "disabled",
    },
  ],
  tags: commonTags,
});

// ==================== ECS Task Definition ====================

const taskDefinition = new aws.ecs.TaskDefinition("api-task", {
  family: pulumi.interpolate`${projectName}-api-${environment}`,
  networkMode: "awsvpc",
  requiresCompatibilities: ["FARGATE"],
  cpu: environment === "production" ? "1024" : "512",
  memory: environment === "production" ? "2048" : "1024",
  executionRoleArn: ecsTaskExecutionRole.arn,
  taskRoleArn: ecsTaskRole.arn,
  containerDefinitions: pulumi.interpolate`[
    {
      "name": "api",
      "image": "eve-secure:latest",
      "portMappings": [
        {
          "containerPort": 3000,
          "protocol": "tcp"
        }
      ],
      "environment": [
        {
          "name": "NODE_ENV",
          "value": "${environment}"
        },
        {
          "name": "REDIS_HOST",
          "value": "${redisCluster.cacheNodes[0].address}"
        },
        {
          "name": "REDIS_PORT",
          "value": "6379"
        }
      ],
      "secrets": [
        {
          "name": "DB_PASSWORD",
          "valueFrom": "${dbPasswordSecret.arn}"
        },
        {
          "name": "JWT_SECRET",
          "valueFrom": "${jwtSecretKey.arn}"
        },
        {
          "name": "ENCRYPTION_KEY",
          "valueFrom": "${encryptionKey.arn}"
        },
        {
          "name": "OPENAI_API_KEY",
          "valueFrom": "${openaiApiKey.arn}"
        }
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "${apiLogGroup.name}",
          "awslogs-region": "${region}",
          "awslogs-stream-prefix": "ecs"
        }
      },
      "healthCheck": {
        "command": ["CMD-SHELL", "curl -f http://localhost:3000/health || exit 1"],
        "interval": 30,
        "timeout": 5,
        "retries": 3,
        "startPeriod": 60
      }
    }
  ]`,
  tags: commonTags,
});

// ==================== ECS Service ====================

const alb = new awsx.lb.ApplicationLoadBalancer("eve-secure-alb", {
  internal: false,
  securityGroups: [],
  subnets: vpc.publicSubnetIds,
  tags: commonTags,
});

const targetGroup = alb.createTargetGroup("api-target-group", {
  protocol: "HTTP",
  port: 3000,
  targetType: "ip",
  vpcId: vpc.id,
  healthCheck: {
    enabled: true,
    healthyThreshold: 2,
    unhealthyThreshold: 2,
    timeout: 5,
    interval: 30,
    path: "/health",
    matcher: "200",
  },
});

const listener = targetGroup.createListener("api-listener", {
  protocol: "HTTP",
  port: 80,
});

const apiServiceSecurityGroup = new aws.ec2.SecurityGroup("api-service-sg", {
  vpcId: vpc.id,
  ingress: [
    {
      protocol: "tcp",
      fromPort: 3000,
      toPort: 3000,
      securityGroups: [alb.securityGroup.id],
    },
  ],
  egress: [
    {
      protocol: "-1",
      fromPort: 0,
      toPort: 0,
      cidrBlocks: ["0.0.0.0/0"],
    },
  ],
  tags: { ...commonTags, Name: "api-service-sg" },
});

const service = new aws.ecs.Service("api-service", {
  cluster: cluster.arn,
  taskDefinition: taskDefinition.arn,
  desiredCount: environment === "production" ? 3 : 2,
  launchType: "FARGATE",
  networkConfiguration: {
    subnets: vpc.privateSubnetIds,
    securityGroups: [apiServiceSecurityGroup.id],
    assignPublicIp: false,
  },
  loadBalancers: [
    {
      targetGroupArn: targetGroup.targetGroup.arn,
      containerName: "api",
      containerPort: 3000,
    },
  ],
  tags: commonTags,
});

// ==================== Lambda for PDF Generation ====================

const pdfLambdaSecurityGroup = new aws.ec2.SecurityGroup("pdf-lambda-sg", {
  vpcId: vpc.id,
  egress: [
    {
      protocol: "-1",
      fromPort: 0,
      toPort: 0,
      cidrBlocks: ["0.0.0.0/0"],
    },
  ],
  tags: { ...commonTags, Name: "pdf-lambda-sg", Purpose: "PDFGeneration" },
});

const pdfLambda = new aws.lambda.Function("pdf-generator", {
  name: pulumi.interpolate`${projectName}-pdf-${environment}`,
  role: lambdaExecutionRole.arn,
  handler: "index.handler",
  runtime: "nodejs20.x",
  timeout: 300,
  memorySize: 3008,
  code: new pulumi.asset.AssetArchive({
    ".": new pulumi.asset.FileAsset("./lambda/pdf-generator/dist"),
  }),
  vpcConfig: {
    subnetIds: vpc.privateSubnetIds,
    securityGroupIds: [pdfLambdaSecurityGroup.id],
  },
  environment: {
    variables: {
      NODE_ENV: environment,
    },
  },
  tags: commonTags,
});

// ==================== Lambda for ClamAV Scanning ====================

const clamavLambdaSecurityGroup = new aws.ec2.SecurityGroup("clamav-lambda-sg", {
  vpcId: vpc.id,
  egress: [
    {
      protocol: "-1",
      fromPort: 0,
      toPort: 0,
      cidrBlocks: ["0.0.0.0/0"],
    },
  ],
  tags: { ...commonTags, Name: "clamav-lambda-sg", Purpose: "Scanning" },
});

const clamavLambda = new aws.lambda.Function("clamav-scanner", {
  name: pulumi.interpolate`${projectName}-clamav-${environment}`,
  role: lambdaExecutionRole.arn,
  handler: "index.handler",
  runtime: "nodejs20.x",
  timeout: 900,
  memorySize: 3008,
  code: new pulumi.asset.AssetArchive({
    ".": new pulumi.asset.FileAsset("./lambda/clamav-scanner/dist"),
  }),
  vpcConfig: {
    subnetIds: vpc.privateSubnetIds,
    securityGroupIds: [clamavLambdaSecurityGroup.id],
  },
  environment: {
    variables: {
      NODE_ENV: environment,
      S3_BUCKET: appDataBucket.id,
    },
  },
  tags: commonTags,
});

// ==================== Outputs ====================

export const vpcId = vpc.id;
export const vpcCidr = "10.0.0.0/16";
export const privateSubnetIds = vpc.privateSubnetIds;
export const publicSubnetIds = vpc.publicSubnetIds;

export const appDataBucketName = appDataBucket.id;
export const auditBucketName = auditBucket.id;
export const backupBucketName = backupBucket.id;

export const redisEndpoint = redisCluster.cacheNodes[0].address;
export const redisPort = 6379;

export const albDns = alb.loadBalancer.dnsName;
export const ecsClusterName = cluster.name;
export const ecsServiceName = service.name;

export const apiLogGroupName = apiLogGroup.name;
export const auditLogGroupName = auditLogGroup.name;

export const pdfLambdaFunctionName = pdfLambda.name;
export const clamavLambdaFunctionName = clamavLambda.name;

export const dbPasswordSecretArn = dbPasswordSecret.arn;
export const jwtSecretArn = jwtSecretKey.arn;
