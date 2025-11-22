     = list(string)
}

variable "container_image" {
  description = "ECR image URI for the webforx online storeshop app"
  type        = string
}

variable "db_username" {
  description = "DB master username"
  type        = string
  default     = "app_admin"
}

variable "db_name" {
  description = "Database name for the application"
  type        = string
  default     = "webforx_store"
}

variable "db_instance_class" {
  description = "RDS instance class"
  type        = string
  default     = "db.t4g.micro"
}

variable "db_allocated_storage" {
  description = "RDS allocated storage in GB"
  type        = number
  default     = 20
}

variable "db_engine_version" {
  description = "PostgreSQL engine version"
  type        = string
  default     = "15.4"
}

terraform {
  required_version = ">= 1.5.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.0"
    }
  }
}

provider "aws" {
  region = var.region
}

#########################
# VARIABLES
#########################

variable "region" {
  description = "AWS region"
  type        = string
  default     = "us-east-1"
}

variable "vpc_id" {
  description = "Existing VPC ID"
  type        = string
  default     = "vpc-0dd535e873ee53982"
}

variable "public_subnet_ids" {
  description = "Public subnets for ALB"
  type        = list(string)
}

variable "private_subnet_ids" {
  description = "Private subnets for ECS tasks and RDS"
  type   #########################
# RANDOM PASSWORD
#########################

resource "random_password" "db" {
  length  = 16
  special = true
}

#########################
# SECURITY GROUPS
#########################

# ALB SG: HTTP from internet → ECS tasks
resource "aws_security_group" "alb" {
  name        = "wfx-storeshop-alb-sg"
  description = "ALB security group for wfx-storeshop"
  vpc_id      = var.vpc_id

  ingress {
    description = "HTTP from Internet"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "wfx-storeshop-alb-sg"
  }
}

# ECS tasks SG: traffic from ALB on 8080, outbound to RDS, internet via NAT
resource "aws_security_group" "ecs_tasks" {
  name        = "wfx-storeshop-ecs-sg"
  description = "ECS tasks security group for wfx-storeshop"
  vpc_id      = var.vpc_id

  ingress {
    description     = "App traffic from ALB"
    from_port       = 8080
    to_port         = 8080
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "wfx-storeshop-ecs-sg"
  }
}

# RDS SG: allow Postgres only from ECS tasks SG
resource "aws_security_group" "db" {
  name        = "wfx-storeshop-db-sg"
  description = "RDS security group for wfx-storeshop"
  vpc_id      = var.vpc_id

  ingress {
    description     = "Postgres from ECS tasks"
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.ecs_tasks.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "wfx-storeshop-db-sg"
  }
}

#########################
# RDS SUBNET GROUP + INSTANCE
#########################

resource "aws_db_subnet_group" "this" {
  name       = "wfx-storeshop-db-subnet-group"
  subnet_ids = var.private_subnet_ids

  tags = {
    Name = "wfx-storeshop-db-subnet-group"
  }
}

resource "aws_db_instance" "this" {
  identifier        = "wfx-storeshop-db"
  engine            = "postgres"
  engine_version    = var.db_engine_version
  instance_class    = var.db_instance_class
  allocated_storage = var.db_allocated_storage

  db_name  = var.db_name
  username = var.db_username
  password = random_password.db.result

  db_subnet_group_name   = aws_db_subnet_group.this.name
  vpc_security_group_ids = [aws_security_group.db.id]

  publicly_accessible = false
  storage_encrypted   = true

  skip_final_snapshot = true
  deletion_protection = false

  tags = {
    Name = "wfx-storeshop-db"
  }
}

#########################
# SECRETS MANAGER (DB SECRET)
#########################

resource "aws_secretsmanager_secret" "db" {
  name = "wfx-storeshop-db-credentials"

  tags = {
    Name = "wfx-storeshop-db-credentials"
  }
}

resource "aws_secretsmanager_secret_version" "db" {
  secret_id = aws_secretsmanager_secret.db.id

  secret_string = jsonencode({
    username             = var.db_username
    password             = random_password.db.result
    engine               = aws_db_instance.this.engine
    host                 = aws_db_instance.this.address
    port                 = aws_db_instance.this.port
    dbname               = var.db_name
    dbInstanceIdentifier = aws_db_instance.this.identifier
  })
}

#########################
# CLOUDWATCH LOG GROUP
#########################

resource "aws_cloudwatch_log_group" "app" {
  name              = "/ecs/wfx-storeshop"
  retention_in_days = 14

  tags = {
    Name = "wfx-storeshop-logs"
  }
}

#########################
# IAM ROLES
#########################

# Execution role: ECR, CloudWatch Logs, Secrets (via ECS task definition)
data "aws_iam_policy_document" "ecs_task_execution_assume" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "ecs_task_execution" {
  name               = "wfx-storeshop-ecsTaskExecutionRole"
  assume_role_policy = data.aws_iam_policy_document.ecs_task_execution_assume.json
}

resource "aws_iam_role_policy_attachment" "ecs_task_execution_policy" {
  role       = aws_iam_role.ecs_task_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

# Task role: app-level permissions (Secrets Manager read)
data "aws_iam_policy_document" "ecs_task_assume" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "ecs_task" {
  name               = "wfx-storeshop-ecsTaskRole"
  assume_role_policy = data.aws_iam_policy_document.ecs_task_assume.json
}

data "aws_iam_policy_document" "ecs_task_policy" {
  statement {
    sid     = "AllowReadDbSecret"
    actions = [
      "secretsmanager:GetSecretValue"
    ]
    resources = [
      aws_secretsmanager_secret.db.arn
    ]
  }
}

resource "aws_iam_policy" "ecs_task" {
  name   = "wfx-storeshop-ecsTaskPolicy"
  policy = data.aws_iam_policy_document.ecs_task_policy.json
}

resource "aws_iam_role_policy_attachment" "ecs_task_policy_attach" {
  role       = aws_iam_role.ecs_task.name
  policy_arn = aws_iam_policy.ecs_task.arn
}

#########################
# ECS CLUSTER
#########################

resource "aws_ecs_cluster" "app" {
  name = "wfx-storeshop-cluster"

  setting {
    name  = "containerInsights"
    value = "enabled"
  }

  tags = {
    Name = "wfx-storeshop-cluster"
  }
}

#########################
# ALB + TARGET GROUP + LISTENER
#########################

resource "aws_lb" "app" {
  name               = "alb-wfx-storeshop"
  load_balancer_type = "application"
  internal           = false
  security_groups    = [aws_security_group.alb.id]
  subnets            = var.public_subnet_ids

  tags = {
    Name = "alb-wfx-storeshop"
  }
}

resource "aws_lb_target_group" "app" {
  name        = "tg-wfx-storeshop"
  port        = 8080
  protocol    = "HTTP"
  vpc_id      = var.vpc_id
  target_type = "ip"

  health_check {
    path                = "/healthz"
    protocol            = "HTTP"
    matcher             = "200-399"
    interval            = 30
    timeout             = 5
    healthy_threshold   = 3
    unhealthy_threshold = 3
  }

  tags = {
    Name = "tg-wfx-storeshop"
  }
}

resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.app.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.app.arn
  }
}

#########################
# ECS TASK DEFINITION
#########################

resource "aws_ecs_task_definition" "app" {
  family                   = "wfx-storeshop"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = "256"
  memory                   = "512"
  execution_role_arn       = aws_iam_role.ecs_task_execution.arn
  task_role_arn            = aws_iam_role.ecs_task.arn

  container_definitions = jsonencode([
    {
      name      = "app"
      image     = var.container_image
      essential = true

      portMappings = [
        {
          containerPort = 8080
          protocol      = "tcp"
        }
      ]

      environment = [
        {
          name  = "PORT"
          value = "8080"
        },
        {
          name  = "TYPEORM_SYNC"
          value = "true"
        },
        {
          name  = "DB_SSL"
          value = "true"
        }
      ]

      secrets = [
        {
          name      = "DB_SECRET"
          valueFrom = aws_secretsmanager_secret.db.arn
        }
      ]

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = aws_cloudwatch_log_group.app.name
          awslogs-region        = var.region
          awslogs-stream-prefix = "ecs"
        }
      }

      healthCheck = {
        retries     = 3
        command     = ["CMD-SHELL", "curl -fsS http://localhost:8080/healthz || exit 1"]
        timeout     = 5
        interval    = 30
        startPeriod = 10
      }
    }
  ])

  tags = {
    Name = "wfx-storeshop-taskdef"
  }
}

#########################
# ECS SERVICE
#########################

resource "aws_ecs_service" "app" {
  name            = "wfx-storeshop-service"
  cluster         = aws_ecs_cluster.app.id
  task_definition = aws_ecs_task_definition.app.arn
  desired_count   = 1
  launch_type     = "FARGATE"

  deployment_minimum_healthy_percent = 50
  deployment_maximum_percent         = 200

  network_configuration {
    subnets         = var.private_subnet_ids
    security_groups = [aws_security_group.ecs_tasks.id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.app.arn
    container_name   = "app"
    container_port   = 8080
  }

  depends_on = [
    aws_lb_listener.http
  ]

  tags = {
    Name = "wfx-storeshop-service"
  }
}

#########################
# OUTPUTS
#########################

output "alb_dns_name" {
  description = "Public DNS name of the ALB"
  value       = aws_lb.app.dns_name
}

output "db_endpoint" {
  description = "RDS endpoint"
  value       = aws_db_instance.this.address
}

output "db_secret_arn" {
  description = "Secrets Manager ARN for DB credentials"
  value       = aws_secretsmanager_secret.db.arn
}

output "ecs_cluster_name" {
  description = "ECS cluster name"
  value       = aws_ecs_cluster.app.name
}

output "ecs_service_name" {
  description = "ECS service name"
  value       = aws_ecs_service.app.name
}

