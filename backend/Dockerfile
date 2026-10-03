FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

# Copy project files first so `dotnet restore` is cached as its own layer
# and only re-runs when a .csproj actually changes.
COPY Backend.slnx .
COPY src/SharedKernel/SharedKernel.csproj src/SharedKernel/
COPY src/Modules/Identity/Identity.Domain/Identity.Domain.csproj src/Modules/Identity/Identity.Domain/
COPY src/Modules/Identity/Identity.Application/Identity.Application.csproj src/Modules/Identity/Identity.Application/
COPY src/Modules/Identity/Identity.Infrastructure/Identity.Infrastructure.csproj src/Modules/Identity/Identity.Infrastructure/
COPY src/Modules/Identity/Identity.Api/Identity.Api.csproj src/Modules/Identity/Identity.Api/
COPY src/Modules/Campaigns/Campaigns.Domain/Campaigns.Domain.csproj src/Modules/Campaigns/Campaigns.Domain/
COPY src/Modules/Campaigns/Campaigns.Application/Campaigns.Application.csproj src/Modules/Campaigns/Campaigns.Application/
COPY src/Modules/Campaigns/Campaigns.Infrastructure/Campaigns.Infrastructure.csproj src/Modules/Campaigns/Campaigns.Infrastructure/
COPY src/Modules/Campaigns/Campaigns.Api/Campaigns.Api.csproj src/Modules/Campaigns/Campaigns.Api/
COPY src/Modules/Eligibility/Eligibility.Domain/Eligibility.Domain.csproj src/Modules/Eligibility/Eligibility.Domain/
COPY src/Modules/Eligibility/Eligibility.Application/Eligibility.Application.csproj src/Modules/Eligibility/Eligibility.Application/
COPY src/Modules/Eligibility/Eligibility.Infrastructure/Eligibility.Infrastructure.csproj src/Modules/Eligibility/Eligibility.Infrastructure/
COPY src/Modules/Eligibility/Eligibility.Api/Eligibility.Api.csproj src/Modules/Eligibility/Eligibility.Api/
COPY src/Modules/Sessions/Sessions.Domain/Sessions.Domain.csproj src/Modules/Sessions/Sessions.Domain/
COPY src/Modules/Sessions/Sessions.Application/Sessions.Application.csproj src/Modules/Sessions/Sessions.Application/
COPY src/Modules/Sessions/Sessions.Infrastructure/Sessions.Infrastructure.csproj src/Modules/Sessions/Sessions.Infrastructure/
COPY src/Modules/Sessions/Sessions.Api/Sessions.Api.csproj src/Modules/Sessions/Sessions.Api/
COPY src/Host/Host.csproj src/Host/
RUN dotnet restore src/Host/Host.csproj

COPY src/ src/
RUN dotnet publish src/Host/Host.csproj -c Release -o /app --no-restore

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime
WORKDIR /app
COPY --from=build /app .

EXPOSE 8080
ENTRYPOINT ["dotnet", "Host.dll"]
