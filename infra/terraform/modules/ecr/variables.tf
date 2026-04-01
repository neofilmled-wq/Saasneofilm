variable "project" {
  type = string
}

variable "repositories" {
  description = "List of ECR repository names"
  type        = list(string)
}
