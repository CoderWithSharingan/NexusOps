
resource "aws_s3_bucket" "nexusops" {
  count  = var.s3_enabled ? 1 : 0
  bucket = var.s3_bucket_name

  tags = {
    Name        = var.s3_bucket_name
    ManagedBy   = "NexusOps"
    Application = var.application_name
  }
}
