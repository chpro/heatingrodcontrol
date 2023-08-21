sudo docker build -t heatingrodcontrol:latest-test .
sudo docker rm heatingrodcontrol
sudo docker run -d -p 3000:3000 -e "INFLUX_HOST=localhost" -e "SWITCH0_HOST=localhost" --name heatingrodcontrol heatingrodcontrol:latest-test

read -p "Press any key to stop container" PRESS
sudo docker stop heatingrodcontrol