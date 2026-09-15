{ pkgs }: {
  deps = [
    pkgs.nodejs_22
    pkgs.jdk21
    pkgs.android-tools
  ];
  env = {
    JAVA_HOME = "${pkgs.jdk21}/lib/openjdk";
  };
}