# Security group for the EC2 instance itself.
resource "aws_security_group" "app_server" {
  name        = "checkmywarranty-app-server"
  description = "CheckMyWarranty EC2 instance - SSH, HTTP, HTTPS"
  vpc_id      = var.vpc_id

  ingress {
    description = "SSH"
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    # Tighten this to your own IP/32 once set up — 0.0.0.0/0 is fine to get started
    # but is the first thing to lock down.
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "HTTP for Certbot challenge and HTTPS redirect"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "HTTPS"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    description = "Allow all outbound (Groq/Cohere/Brevo/S3/apt/npm/docker pulls, etc.)"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name    = "checkmywarranty-app-server"
    Project = "checkmywarranty"
  }
}

# This adds a rule to your EXISTING, manually-created RDS security group,
# allowing inbound Postgres traffic only from the EC2 security group above.
# It does not touch or replace anything else already on that security group.
resource "aws_security_group_rule" "rds_from_app_server" {
  type                     = "ingress"
  from_port                = 5432
  to_port                  = 5432
  protocol                 = "tcp"
  security_group_id        = var.rds_security_group_id
  source_security_group_id = aws_security_group.app_server.id
  description              = "Allow Postgres access from the CheckMyWarranty EC2 app server"
}
