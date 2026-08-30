data "aws_caller_identity" "current" {}

resource "aws_iam_role" "app_server" {
  name = "checkmywarranty-app-server-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "ec2.amazonaws.com" }
    }]
  })
}

# Scoped to exactly this bucket — not "AmazonS3FullAccess", which would let
# this instance touch every bucket in the account.
resource "aws_iam_role_policy" "s3_access" {
  name = "checkmywarranty-s3-access"
  role = aws_iam_role.app_server.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "ObjectAccess"
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:PutObject",
          "s3:DeleteObject"
        ]
        Resource = "arn:aws:s3:::${var.s3_bucket_name}/*"
      },
      {
        Sid      = "BucketListing"
        Effect   = "Allow"
        Action   = ["s3:ListBucket"]
        Resource = "arn:aws:s3:::${var.s3_bucket_name}"
      }
    ]
  })
}

resource "aws_iam_instance_profile" "app_server" {
  name = "checkmywarranty-app-server-profile"
  role = aws_iam_role.app_server.name
}
