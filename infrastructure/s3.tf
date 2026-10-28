
resource "aws_s3_bucket" "nexusops" {
  count  = var.s3_enabled ? 1 : 0
  bucket = var.s3_bucket_name

  tags = {
    Name        = var.s3_bucket_name
    ManagedBy   = "NexusOps"
    Application = var.application_name
  }
}

resource "aws_s3_bucket_public_access_block" "nexusops" {
  count  = var.s3_enabled ? 1 : 0
  bucket = aws_s3_bucket.nexusops[0].id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "nexusops" {
  count  = var.s3_enabled ? 1 : 0
  bucket = aws_s3_bucket.nexusops[0].id

  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "nexusops" {
  count  = var.s3_enabled ? 1 : 0
  bucket = aws_s3_bucket.nexusops[0].id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}
