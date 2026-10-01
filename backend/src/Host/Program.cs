using Identity.Infrastructure;

var builder = WebApplication.CreateBuilder(args);

// Add services to the container.
// Each module's Api assembly must be registered as an MVC "application part" —
// controllers living in a referenced class library aren't discovered otherwise.
builder.Services
    .AddControllers()
    .AddApplicationPart(typeof(Identity.Api.AuthController).Assembly);

// Learn more about configuring OpenAPI at https://aka.ms/aspnet/openapi
builder.Services.AddOpenApi();

// Every module exposes one AddXInfrastructure() extension. Program.cs only ever
// composes modules together — it must never contain module-specific logic.
builder.Services.AddIdentityInfrastructure(builder.Configuration);

builder.Services.AddCors(options =>
{
    options.AddPolicy("Frontend", policy => policy
        .WithOrigins(builder.Configuration["Frontend:Origin"] ?? "http://localhost:3000")
        .AllowAnyHeader()
        .AllowAnyMethod()
        .AllowCredentials());
});

var app = builder.Build();

// Configure the HTTP request pipeline.
if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

app.UseHttpsRedirection();

app.UseCors("Frontend");

app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();

app.Run();
