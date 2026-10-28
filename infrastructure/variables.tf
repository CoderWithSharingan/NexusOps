
variable "aws_region" {
  description = "AWS region for NexusOps resources"
  type        = string
}

variable "s3_enabled" {
  description = "Whether NexusOps should manage an S3 bucket"
  type        = bool
  default     = false
}

variable "s3_bucket_name" {
  description = "Name of the S3 bucket managed by NexusOps"
  type        = string
  default     = ""
}

variable "application_name" {
  description = "Name of the application managed by NexusOps"
  type        = string
}

variable "ecr_enabled" {
  description = "Whether NexusOps should manage an ECR repository"
  type        = bool
  default     = false
}

variable "ecr_repository_name" {
  description = "Name of the ECR repository managed by NexusOps"
  type        = string
  default     = ""
}

variable "ecr_image_tag_mutability" {
  description = "Whether ECR image tags can be overwritten"
  type        = string
  default     = "IMMUTABLE"

  validation {
    condition     = contains(["MUTABLE", "IMMUTABLE"], var.ecr_image_tag_mutability)
    error_message = "ecr_image_tag_mutability must be MUTABLE or IMMUTABLE."
  }
}

variable "ecr_scan_on_push" {
  description = "Whether ECR scans images when they are pushed"
  type        = bool
  default     = true
}
