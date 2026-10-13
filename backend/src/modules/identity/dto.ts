import { IsNotEmpty, IsString, MaxLength } from "class-validator";

export class LoginDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  loginId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  password!: string;
}

export class EmptyJsonDto {}

export class DemoLoginDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  loginId!: string;
}
