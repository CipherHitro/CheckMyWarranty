variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "us-east-1"
}

variable "instance_type" {
  description = "EC2 instance size"
  type        = string
  default     = "t3.small"
}

variable "key_pair_name" {
  description = "Name of the EC2 key pair already created in this AWS account/region (see step 1 of the manual setup)"
  type        = string
}

variable "vpc_id" {
  description = "VPC ID that your RDS instance lives in (find this on the RDS instance's Connectivity & security tab)"
  type        = string
}

variable "subnet_id" {
  description = "A public subnet ID inside vpc_id for the EC2 instance (needs auto-assign public IP enabled, or you attach the Elastic IP anyway). Your existing RDS instance already has its own subnet group configured in AWS, so you only need one subnet here for the EC2 instance."
  type        = string
}

variable "rds_security_group_id" {
  description = "The security group ID currently attached to your RDS instance — Terraform will add an ingress rule to it, not replace it"
  type        = string
}

variable "elastic_ip_allocation_id" {
  description = "Allocation ID of the Elastic IP you created manually in step 1 (e.g. eipalloc-xxxxxxxx)"
  type        = string
}

variable "s3_bucket_name" {
  description = "Name of the S3 bucket you created manually for file storage"
  type        = string
}

variable "github_repo_url" {
  description = "HTTPS URL of your GitHub repo"
  type        = string
  default     = "https://github.com/CipherHitro/CheckMyWarranty.git"
}

variable "domain_name" {
  description = "Domain the backend is served on (must already point at the Elastic IP in DNS before first boot, for Certbot to succeed)"
  type        = string
  default     = "checkmywarranty-backend.mentalorbit.tech"
}

variable "certbot_email" {
  description = "Email for Let's Encrypt renewal notices"
  type        = string
}

variable "database_url" {
  description = "Full Postgres connection string for Prisma, e.g. postgresql://user:pass@your-rds-endpoint:5432/dbname"
  type        = string
  sensitive   = true
}

variable "app_env_vars" {
  description = "Every other secret/env var your backend .env needs (Groq key, Cohere key, Brevo key, JWT secret, S3 credentials, etc.) as a map of KEY = value"
  type        = map(string)
  sensitive   = true
  default     = {}
}
