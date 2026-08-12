# BEYU HEALTH OS — Terraform skeleton for AWS/GCP/Azure agnostic deployment
# Provisions PostgreSQL (RDS/Cloud SQL), Redis (ElastiCache/Memorystore), S3-compatible storage, and K8s manifests

terraform {
  required_version = ">= 1.5.0"
  required_providers {
    kubernetes = { source = "hashicorp/kubernetes", version = "~> 2.23" }
    aws = { source = "hashicorp/aws", version = "~> 5.0" }
  }
}

variable "env" { type = string; default = "production" }
variable "region" { type = string; default = "af-south-1" } # Africa close to TZ
variable "tenant_count" { type = number; default = 10 }

resource "aws_db_instance" "beyu_health_postgres" {
  identifier             = "beyu-health-${var.env}"
  engine                 = "postgres"
  engine_version         = "16"
  instance_class         = "db.r6g.large"
  allocated_storage      = 100
  storage_encrypted      = true
  db_name                = "beyu_health_os"
  username               = "beyu_health"
  manage_master_user_password = true
  backup_retention_period = 30
  deletion_protection    = true
  final_snapshot_identifier = "beyu-health-${var.env}-final"
  tags = { Sector = "Health", OS = "BEYU HEALTH OS", Compliance = "TZ-MOH+NHIF+ISO27001" }
}

resource "aws_elasticache_cluster" "beyu_health_redis" {
  cluster_id           = "beyu-health-${var.env}"
  engine               = "redis"
  node_type            = "cache.t3.micro"
  num_cache_nodes      = 1
  parameter_group_name = "default.redis7"
}

resource "aws_s3_bucket" "beyu_health_documents" {
  bucket = "beyu-health-os-documents-${var.env}"
  tags = { Sector = "Health", DataResidency = "tz" }
}

resource "aws_s3_bucket_versioning" "beyu_health_documents_versioning" {
  bucket = aws_s3_bucket.beyu_health_documents.id
  versioning_configuration { status = "Enabled" }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "beyu_health_docs_enc" {
  bucket = aws_s3_bucket.beyu_health_documents.id
  rule { apply_server_side_encryption_by_default { sse_algorithm = "aws:kms" } }
}

output "db_endpoint" { value = aws_db_instance.beyu_health_postgres.endpoint }
output "redis_endpoint" { value = aws_elasticache_cluster.beyu_health_redis.cache_nodes[0].address }
output "s3_bucket" { value = aws_s3_bucket.beyu_health_documents.bucket }
