resource "aws_ecr_repository" "nexusops" {
  count                = var.ecr_enabled ? 1 : 0
  name                 = var.ecr_repository_name
  image_tag_mutability = var.ecr_image_tag_mutability
  force_delete         = false

  image_scanning_configuration {
    scan_on_push = var.ecr_scan_on_push
  }

  encryption_configuration {
    encryption_type = "AES256"
  }

  tags = {
    Name        = var.ecr_repository_name
    ManagedBy   = "NexusOps"
    Application = var.application_name
  }
}
