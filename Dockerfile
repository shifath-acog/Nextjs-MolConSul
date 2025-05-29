FROM ubuntu:22.04

RUN apt-get update && \
    apt-get install -y wget bzip2 ca-certificates curl vim git build-essential cmake

# Install Miniconda
ENV CONDA_DIR=/opt/conda
ENV PATH=$CONDA_DIR/bin:$PATH

RUN wget --quiet https://repo.anaconda.com/miniconda/Miniconda3-latest-Linux-x86_64.sh -O /tmp/miniconda.sh && \
    /bin/bash /tmp/miniconda.sh -b -p $CONDA_DIR && \
    rm /tmp/miniconda.sh

RUN conda install -y -c conda-forge mamba && \
    mamba install -y python=3.11 numpy pandas scipy cudatoolkit -c conda-forge

# Install Open Babel
RUN apt-get update && apt-get install -y \
    openbabel \
    && apt-get clean && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy the pipeline and Next.js app to /app
COPY . /app

# Install Poetry and pipeline dependencies
RUN pip install --upgrade pip \
    && pip install poetry \
    && poetry install --no-interaction --no-ansi \
    && poetry build

# Install Node.js and Next.js dependencies
WORKDIR /app/molconsul-nextjs
RUN curl -fsSL https://deb.nodesource.com/setup_18.x | bash - && \
    apt-get install -y nodejs && \
    npm install --legacy-peer-deps && \
    npm run build

# Create a non-root user
#RUN groupadd --system --gid 1001 nodejs && \
#    useradd --system --uid 1001 --gid nodejs nextjs

# Create the /app/temp directory and set permissions
#RUN mkdir -p /app/temp && \
#  chown -R nextjs:nodejs /app

# Set the user to non-root
#USER nextjs

EXPOSE 3000

# Start the Next.js app
CMD ["npm", "start"]

# docker run -d --gpus all --name molconsul-next-app  molconsul-app