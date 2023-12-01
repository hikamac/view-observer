FROM dart:stable

RUN apt-get update && apt-get install -y \
    wget \
    git \
    unzip

# install Coogle Chrome
RUN wget https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb
RUN apt-get install -y ./google-chrome-stable_current_amd64.deb
RUN rm google-chrome-stable_current_amd64.deb

# install fvm
RUN dart pub global activate fvm

# latest major revision as of 2023-11-30 
ARG FLUTTER_VERSION=stable
RUN fvm install $FLUTTER_VERSION
ENV PATH="$PATH:/root/fvm/versions/${FLUTTER_VERSION}/bin"

COPY . /app
WORKDIR /app

# get flutter dependencies
RUN fvm flutter pub get --verbose
