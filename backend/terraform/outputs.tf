output "instance_id" {
  value = aws_instance.app_server.id
}

output "instance_public_ip" {
  description = "Should match your Elastic IP once the association takes effect"
  value       = aws_eip_association.app_server.public_ip
}

output "ssh_command" {
  value = "ssh -i aws-keypair.pem ubuntu@${aws_eip_association.app_server.public_ip}"
}

output "app_security_group_id" {
  value = aws_security_group.app_server.id
}
