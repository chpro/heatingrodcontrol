sudo docker build -t heatingrodcontrol:latest-test .
sudo docker rm heatingrodcontrol
sudo docker run -d -p 3000:3000 -e TZ=Europe/Vienna -e "INFLUX_TOKEN=$INFLUX_TOKEN" -e "DRY_RUN=true" -e "RUN_WITH_TIMER=true" --name heatingrodcontrol heatingrodcontrol:latest-test

read -p "Press any key to stop container" PRESS
sudo docker stop heatingrodcontrol
sudo docker rm heatingrodcontrol