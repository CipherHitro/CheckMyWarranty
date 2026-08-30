data "aws_ami" "ubuntu" {
  most_recent = true
  owners      = ["099720109477"] # Canonical

  filter {
    name   = "name"
    values = ["ubuntu/images/hvm-ssd/ubuntu-jammy-22.04-amd64-server-*"]
  }
}

resource "aws_instance" "app_server" {
  ami                    = data.aws_ami.ubuntu.id
  instance_type          = var.instance_type
  key_name               = var.key_pair_name
  subnet_id              = var.subnet_id
  vpc_security_group_ids = [aws_security_group.app_server.id]
  iam_instance_profile   = aws_iam_instance_profile.app_server.name

  root_block_device {
    volume_size = 20
    volume_type = "gp3"
  }

  user_data = templatefile("${path.module}/templates/bootstrap.sh.tpl", {
    github_repo_url = var.github_repo_url
    domain_name     = var.domain_name
    certbot_email   = var.certbot_email
    database_url    = var.database_url
    s3_bucket_name  = var.s3_bucket_name
    aws_region      = var.aws_region
    app_env_vars    = var.app_env_vars
  })

  tags = {
    Name    = "checkmywarranty-app-server"
    Project = "checkmywarranty"
  }
}

# Associates your persistent, manually-allocated Elastic IP with whichever
# instance currently exists. The IP itself is never created or destroyed here.
resource "aws_eip_association" "app_server" {
  instance_id   = aws_instance.app_server.id
  allocation_id = var.elastic_ip_allocation_id
}
