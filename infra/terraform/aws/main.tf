terraform {
  required_version = ">= 1.6.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.region
}

resource "aws_vpc" "main" {
  cidr_block = "10.20.0.0/16"
  tags = { Name = "test-scan-vpc" }
}

resource "aws_db_subnet_group" "rds" {
  name       = "test-scan-rds-subnets"
  subnet_ids = var.subnet_ids
}

resource "aws_db_instance" "postgres" {
  identifier           = "test-scan-postgres"
  allocated_storage    = 20
  engine               = "postgres"
  engine_version       = "16"
  instance_class       = "db.t4g.micro"
  username             = var.db_username
  password             = var.db_password
  db_subnet_group_name = aws_db_subnet_group.rds.name
  skip_final_snapshot  = true
}

resource "aws_msk_cluster" "kafka" {
  cluster_name           = "test-scan-msk"
  kafka_version          = "3.6.0"
  number_of_broker_nodes = 2

  broker_node_group_info {
    instance_type   = "kafka.t3.small"
    client_subnets  = var.subnet_ids
    security_groups = var.security_group_ids
  }
}

output "postgres_endpoint" {
  value = aws_db_instance.postgres.address
}

output "kafka_bootstrap_brokers" {
  value = aws_msk_cluster.kafka.bootstrap_brokers
}
