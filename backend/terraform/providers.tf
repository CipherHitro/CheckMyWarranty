terraform {
  required_version = ">= 1.5.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  # Local state is fine to start, but it stores your RDS endpoint, S3 bucket
  # name, and other values in plain JSON on disk. Do NOT commit terraform.tfstate
  # to git. Once you're comfortable, move to a remote backend (an S3 bucket +
  # DynamoDB lock table) so state is encrypted and shared safely:
  #
  # backend "s3" {
  #   bucket = "your-terraform-state-bucket"
  #   key    = "checkmywarranty/ec2.tfstate"
  #   region = "us-east-1"
  # }
}

provider "aws" {
  region = var.aws_region
}
